import ts from 'typescript'
import { getCustomNodes, getCustomRunFn } from './custom-nodes'

interface Connection {
  fromNode: string
  fromPort: string
  toNode: string
  toPort: string
}

interface GraphNode {
  id: string
  type: string
  props: Record<string, string | number>
}

interface GraphData {
  nodes: GraphNode[]
  connections: Connection[]
}

export class GraphCompiler {
  private graph: GraphData
  private customCodeMap = new Map<string, string>()
  private readonly helperPrinter = ts.createPrinter()
  private readonly helperSF = ts.createSourceFile('', '', ts.ScriptTarget.ES2020)

  constructor(graph: GraphData) {
    this.graph = graph
  }

  // Główna funkcja kompilująca dany event (np. 'on-update') do czystego JS
  public compileEvent(eventType: string): string {
    this.customCodeMap.clear()

    const eventNodes = this.graph.nodes.filter(n => n.type === eventType)
    const statements: ts.Statement[] = []

    for (const eventNode of eventNodes) {
      const firstConn = this.graph.connections.find(
        c => c.fromNode === eventNode.id && c.fromPort === 'exec'
      )
      if (firstConn) {
        this.compileChain(firstConn.toNode, statements)
      }
    }

    const sourceFile = ts.createSourceFile('generated.ts', '', ts.ScriptTarget.ES2020, false, ts.ScriptKind.TS)
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
    const tsCode = statements.map(st => printer.printNode(ts.EmitHint.Unspecified, st, sourceFile)).join('\n')

    const jsCompiled = ts.transpileModule(tsCode, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
    })

    // Podstawiamy kod własnych węzłów w miejsce placeholderów
    let output = jsCompiled.outputText
    for (const [ph, code] of this.customCodeMap) {
      output = output.replace(new RegExp(`${ph}\\(\\);?`, 'g'), `{\n${code}\n}`)
    }
    return output
  }

  // Rekurencyjne przechodzenie po nitce linii 'exec'
  private compileChain(nodeId: string, statements: ts.Statement[]) {
    const node = this.graph.nodes.find(n => n.id === nodeId)
    if (!node) return

    switch (node.type) {
      case 'log': {
        const msgExpr = this.resolvePort(nodeId, 'msg')
        statements.push(
          ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('console'), ts.factory.createIdentifier('log')),
              undefined,
              [ts.factory.createStringLiteral('[Game]'), msgExpr]
            )
          )
        )
        this.followExec('exec', nodeId, statements)
        break
      }

      case 'move-sprite': {
        const target = this.resolvePort(nodeId, 'target')
        const dx = this.resolvePort(nodeId, 'dx')
        const dy = this.resolvePort(nodeId, 'dy')

        // Generuje kod: const s = this.sprites.get(TARGET); if(s) { s.x += dx; s.y += dy; }
        statements.push(this.createSpriteActionBlock(target, [
          ts.factory.createExpressionStatement(ts.factory.createBinaryExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('s'), 'x'), ts.SyntaxKind.PlusEqualsToken, dx)),
          ts.factory.createExpressionStatement(ts.factory.createBinaryExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('s'), 'y'), ts.SyntaxKind.PlusEqualsToken, dy))
        ]))
        
        this.followExec('exec', nodeId, statements)
        break
      }

      case 'set-velocity': {
        const target = this.resolvePort(nodeId, 'target')
        const vx = this.resolvePort(nodeId, 'vx')
        const vy = this.resolvePort(nodeId, 'vy')

        // Generuje kod: const s = this.sprites.get(target); if(s && s.body) { s.body.setVelocity(vx, vy); }
        statements.push(this.createSpriteActionBlock(target, [
          ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('s'), 'body'), 'setVelocity'),
              undefined,
              [vx, vy]
            )
          )
        ], true))

        this.followExec('exec', nodeId, statements)
        break
      }

      case 'jump': {
        const target = this.resolvePort(nodeId, 'target')
        const force = this.resolvePort(nodeId, 'force')

        // Generuje kod: if(s && s.body && s.body.blocked.down) { s.body.setVelocityY(-Math.abs(force)); }
        statements.push(this.createSpriteActionBlock(target, [
          ts.factory.createIfStatement(
            ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('s'), 'body'), 'blocked'), 'down'),
            ts.factory.createBlock([
              ts.factory.createExpressionStatement(
                ts.factory.createCallExpression(
                  ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('s'), 'body'), 'setVelocityY'),
                  undefined,
                  [ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('Math'), 'abs'), undefined, [force]))]
                )
              )
            ])
          )
        ], true))

        this.followExec('exec', nodeId, statements)
        break
      }

      case 'set-variable': {
        const nameExpr = this.resolvePort(nodeId, 'name')
        const valueExpr = this.resolvePort(nodeId, 'value')
        
        // Generuje kod: this.variables.set(NAME, VALUE);
        statements.push(
          ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('this'), 'variables'), 'set'),
              undefined,
              [nameExpr, valueExpr]
            )
          )
        )
        this.followExec('exec', nodeId, statements)
        break
      }

      // show-text / display-text / set-text – wszystkie warianty nazw
      case 'show-text':
      case 'display-text':
      case 'set-text': {
        const node = this.graph.nodes.find(n => n.id === nodeId)!
        // 'show-text' używa prop 'target' i portu 'text'; starsze warianty 'textId'/'content'
        const isShowText = node.type === 'show-text'
        const targetExpr = isShowText
          ? this.resolvePort(nodeId, 'target')
          : this.resolvePort(nodeId, 'textId')
        const contentExpr = isShowText
          ? this.resolvePort(nodeId, 'text')
          : this.resolvePort(nodeId, 'content')

        // const s = this.sprites.get(target); if (s && s.setText) s.setText(String(content));
        statements.push(
          ts.factory.createVariableStatement(undefined,
            ts.factory.createVariableDeclarationList([
              ts.factory.createVariableDeclaration('_t', undefined, undefined,
                ts.factory.createCallExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('this'), 'sprites'), 'get'),
                  undefined, [targetExpr]
                )
              )
            ], ts.NodeFlags.Const)
          ),
          ts.factory.createIfStatement(
            ts.factory.createBinaryExpression(
              ts.factory.createIdentifier('_t'),
              ts.SyntaxKind.AmpersandAmpersandToken,
              ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('_t'), 'setText')
            ),
            ts.factory.createBlock([
              ts.factory.createExpressionStatement(
                ts.factory.createCallExpression(
                  ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('_t'), 'setText'),
                  undefined,
                  [ts.factory.createCallExpression(ts.factory.createIdentifier('String'), undefined, [contentExpr])]
                )
              )
            ], true)
          )
        )
        this.followExec('exec', nodeId, statements)
        break
      }

      case 'set-position': {
        const target = this.resolvePort(nodeId, 'target')
        const x = this.resolvePort(nodeId, 'x')
        const y = this.resolvePort(nodeId, 'y')

        // const s = this.sprites.get(target);
        // if (s) { if (s.body) s.body.reset(x, y); else s.setPosition(x, y); }
        statements.push(this.createSpriteActionBlock(target, [
          ts.factory.createIfStatement(
            ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('s'), 'body'),
            ts.factory.createBlock([
              ts.factory.createExpressionStatement(
                ts.factory.createCallExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('s'), 'body'), 'reset'),
                  undefined, [x, y]
                )
              )
            ], true),
            ts.factory.createBlock([
              ts.factory.createExpressionStatement(
                ts.factory.createCallExpression(
                  ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('s'), 'setPosition'),
                  undefined, [x, y]
                )
              )
            ], true)
          )
        ]))

        this.followExec('exec', nodeId, statements)
        break
      }

      case 'set-visible': {
        const nodeData = this.graph.nodes.find(n => n.id === nodeId)!
        const target = this.resolvePort(nodeId, 'target')
        const mode = String(nodeData.props.visible ?? 'pokaz')

        let visibilityExpr: ts.Expression
        if (mode === 'pokaz') {
          visibilityExpr = ts.factory.createTrue()
        } else if (mode === 'ukryj') {
          visibilityExpr = ts.factory.createFalse()
        } else {
          // przelacz: !s.visible
          visibilityExpr = ts.factory.createPrefixUnaryExpression(
            ts.SyntaxKind.ExclamationToken,
            ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('s'), 'visible')
          )
        }

        statements.push(this.createSpriteActionBlock(target, [
          ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('s'), 'setVisible'),
              undefined, [visibilityExpr]
            )
          )
        ]))

        this.followExec('exec', nodeId, statements)
        break
      }

      case 'wait': {
        const seconds = this.resolvePort(nodeId, 'seconds')
        const nextConn = this.graph.connections.find(c => c.fromNode === nodeId && c.fromPort === 'exec')
        if (!nextConn) break

        // Zbieramy resztę łańcucha w osobny blok i owijamy w delayedCall
        const delayedStatements: ts.Statement[] = []
        this.compileChain(nextConn.toNode, delayedStatements)

        // this.time.delayedCall(seconds * 1000, () => { ... })
        const msExpr = ts.factory.createBinaryExpression(
          ts.factory.createParenthesizedExpression(seconds),
          ts.SyntaxKind.AsteriskToken,
          ts.factory.createNumericLiteral(1000)
        )
        statements.push(
          ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('this'), 'time'), 'delayedCall'),
              undefined,
              [
                msExpr,
                ts.factory.createArrowFunction(
                  undefined, undefined, [], undefined,
                  ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  ts.factory.createBlock(delayedStatements, true)
                )
              ]
            )
          )
        )
        // wait przerywa synchroniczny łańcuch – nie wywołujemy followExec bezpośrednio
        break
      }

      default: {
        // Próba obsługi węzła użytkownika z rejestru custom-nodes
        const customDef = getCustomNodes().find(n => n.type === node.type)
        if (!customDef) break

        const inputs: Record<string, string> = {}
        for (const propKey of Object.keys(customDef.props)) {
          const expr = this.resolvePort(nodeId, propKey)
          inputs[propKey] = this.helperPrinter.printNode(ts.EmitHint.Expression, expr, this.helperSF)
        }

        const placeholder = `__custom_${nodeId.replace(/\W/g, '_')}`
        try {
          const runFn = getCustomRunFn(customDef)
          this.customCodeMap.set(placeholder, runFn(inputs))
        } catch (err) {
          console.error(`[Compiler] Błąd węzła "${customDef.type}":`, err)
          this.customCodeMap.set(placeholder, `/* error in ${customDef.type} */`)
        }

        statements.push(
          ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
              ts.factory.createIdentifier(placeholder), undefined, []
            )
          )
        )
        this.followExec('exec', nodeId, statements)
        break
      }

      case 'if-condition': {
        const a = this.resolvePort(nodeId, 'a')
        const b = this.resolvePort(nodeId, 'b')
        const opStr = String(node.props.operator ?? '>')
        
        let syntaxOp = ts.SyntaxKind.GreaterThanToken
        if (opStr === '<') syntaxOp = ts.SyntaxKind.LessThanToken
        if (opStr === '>=') syntaxOp = ts.SyntaxKind.GreaterThanEqualsToken
        if (opStr === '<=') syntaxOp = ts.SyntaxKind.LessThanEqualsToken
        if (opStr === '==') syntaxOp = ts.SyntaxKind.EqualsEqualsEqualsToken
        if (opStr === '!=') syntaxOp = ts.SyntaxKind.ExclamationEqualsEqualsToken

        const condition = ts.factory.createBinaryExpression(a, syntaxOp, b)
        
        const trueStatements: ts.Statement[] = []
        const falseStatements: ts.Statement[] = []

        this.followExec('exec-true', nodeId, trueStatements)
        this.followExec('exec-false', nodeId, falseStatements)

        statements.push(
          ts.factory.createIfStatement(
            condition,
            ts.factory.createBlock(trueStatements, true),
            falseStatements.length > 0 ? ts.factory.createBlock(falseStatements, true) : undefined
          )
        )
        break
      }
    }
  }

  private followExec(portId: string, nodeId: string, statements: ts.Statement[]) {
    const conn = this.graph.connections.find(c => c.fromNode === nodeId && c.fromPort === portId)
    if (conn) {
      this.compileChain(conn.toNode, statements)
    }
  }

  // Rekurencyjne rozwijanie wejść wartościowych (Math, GetVariable, itp.) do wyrażeń inline
  private resolvePort(nodeId: string, portId: string): ts.Expression {
    const node = this.graph.nodes.find(n => n.id === nodeId)
    if (!node) return this.createSafeNumericLiteral(0)

    const conn = this.graph.connections.find(c => c.toNode === nodeId && c.toPort === portId)
    if (conn) {
      const fromNode = this.graph.nodes.find(n => n.id === conn.fromNode)
      if (fromNode) {
        switch (fromNode.type) {
          case 'number':
            return this.createSafeNumericLiteral(Number(fromNode.props.value ?? 0))
          case 'string':
            return ts.factory.createStringLiteral(String(fromNode.props.value ?? ''))
          case 'get-variable': {
            const varName = String(fromNode.props.name ?? '')
            return ts.factory.createBinaryExpression(
              ts.factory.createCallExpression(
                ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('this'), 'variables'), 'get'),
                undefined,
                [ts.factory.createStringLiteral(varName)]
              ),
              ts.SyntaxKind.QuestionQuestionToken,
              this.createSafeNumericLiteral(0)
            )
          }
          // --- NOWY KLOCEK DANYCH: Pobierz właściwość obiektu (np. 'get-property') ---
          case 'get-property': {
            const spriteId = String(fromNode.props.target ?? fromNode.props.spriteId ?? '')
            const property = String(fromNode.props.prop ?? fromNode.props.property ?? 'x')
            
            // Generuje inline: (this.sprites.get("player")?.body?.vy ?? 0) lub ?.x
            const isPhysicsProp = ['vx', 'vy', 'speed'].includes(property)
            let access: ts.Expression = ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('this'), 'sprites'), 'get'),
              undefined, [ts.factory.createStringLiteral(spriteId)]
            )

            if (isPhysicsProp) {
              // Tłumaczenie vy -> body.velocity.y, vx -> body.velocity.x
              const axis = property === 'vy' ? 'y' : 'x'
              access = ts.factory.createPropertyAccessChain(
                ts.factory.createPropertyAccessChain(access, ts.factory.createToken(ts.SyntaxKind.QuestionDotToken), 'body'),
                ts.factory.createToken(ts.SyntaxKind.QuestionDotToken), 'velocity'
              )
              return ts.factory.createBinaryExpression(
                ts.factory.createPropertyAccessExpression(access, axis),
                ts.SyntaxKind.QuestionQuestionToken,
                this.createSafeNumericLiteral(0)
              )
            } else {
              // Standardowe x / y
              return ts.factory.createBinaryExpression(
                ts.factory.createPropertyAccessChain(access, ts.factory.createToken(ts.SyntaxKind.QuestionDotToken), property),
                ts.SyntaxKind.QuestionQuestionToken,
                this.createSafeNumericLiteral(0)
              )
            }
          }
          case 'math': {
            const aExpr = this.resolvePort(fromNode.id, 'a')
            const bExpr = this.resolvePort(fromNode.id, 'b')
            const op = String(fromNode.props.operator ?? '+')
            let token = ts.SyntaxKind.PlusToken
            if (op === '-') token = ts.SyntaxKind.MinusToken
            if (op === '*') token = ts.SyntaxKind.AsteriskToken
            if (op === '/') token = ts.SyntaxKind.SlashToken
            if (op === '%') token = ts.SyntaxKind.PercentToken
            return ts.factory.createParenthesizedExpression(ts.factory.createBinaryExpression(aExpr, token, bExpr))
          }
          case 'random': {
            const minExpr = this.resolvePort(fromNode.id, 'min')
            const maxExpr = this.resolvePort(fromNode.id, 'max')
            // Math.random() * (max - min) + min
            return ts.factory.createParenthesizedExpression(
              ts.factory.createBinaryExpression(
                ts.factory.createBinaryExpression(
                  ts.factory.createCallExpression(
                    ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('Math'), 'random'),
                    undefined, []
                  ),
                  ts.SyntaxKind.AsteriskToken,
                  ts.factory.createParenthesizedExpression(
                    ts.factory.createBinaryExpression(maxExpr, ts.SyntaxKind.MinusToken, minExpr)
                  )
                ),
                ts.SyntaxKind.PlusToken,
                minExpr
              )
            )
          }
          case 'on-input': {
            return ts.factory.createIdentifier(portId)
          }
        }
      }
    }

    // Jeśli nic nie podpięto, bierzemy wartość domyślną z właściwości (props)
    const val = node.props[portId]
    if (typeof val === 'number') return this.createSafeNumericLiteral(val)
    if (val && !isNaN(Number(val))) return this.createSafeNumericLiteral(Number(val))
    return ts.factory.createStringLiteral(String(val ?? ''))
  }

  // Pomocnik, który poprawnie dzieli liczby ujemne na operator "-" i wartość dodatnią
  private createSafeNumericLiteral(value: number): ts.Expression {
    if (value < 0) {
      return ts.factory.createPrefixUnaryExpression(
        ts.SyntaxKind.MinusToken,
        ts.factory.createNumericLiteral(Math.abs(value))
      )
    }
    return ts.factory.createNumericLiteral(value)
  }

  // Pomocnik strukturalny do bezpiecznego wyciągania Sprite'a w JS
  private createSpriteActionBlock(targetExpr: ts.Expression, insideStatements: ts.Statement[], checkBody = false): ts.Statement {
    const getSprite = ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList([
        ts.factory.createVariableDeclaration('s', undefined, undefined, 
          ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('this'), 'sprites'), 'get'),
            undefined, [targetExpr]
          )
        )
      ], ts.NodeFlags.Const)
    )

    let condition: ts.Expression = ts.factory.createIdentifier('s')
    if (checkBody) {
      condition = ts.factory.createBinaryExpression(
        condition,
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('s'), 'body')
      )
    }

    const ifCondition = ts.factory.createIfStatement(condition, ts.factory.createBlock(insideStatements, true))
    return ts.factory.createBlock([getSprite, ifCondition], true)
  }
}