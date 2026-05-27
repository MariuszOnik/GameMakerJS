import ts from 'typescript'

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

  constructor(graph: GraphData) {
    this.graph = graph
  }

  // Główna funkcja kompilująca dany event (np. 'on-update') do czystego JS
  public compileEvent(eventType: string): string {
    const eventNodes = this.graph.nodes.filter(n => n.type === eventType)
    const statements: ts.Statement[] = []

    for (const eventNode of eventNodes) {
      // Szukamy co jest podpięte pod wyjście 'exec' tego eventu
      const firstConn = this.graph.connections.find(
        c => c.fromNode === eventNode.id && c.fromPort === 'exec'
      )
      if (firstConn) {
        this.compileChain(firstConn.toNode, statements)
      }
    }

    // Tworzymy wirtualny plik źródłowy i drukujemy kod do postaci stringa
    const sourceFile = ts.createSourceFile('generated.ts', '', ts.ScriptTarget.ES2020, false, ts.ScriptKind.TS)
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
    
    // Łączymy spakowane linie kodu w jeden ciąg znaków
    const tsCode = statements.map(st => printer.printNode(ts.EmitHint.Unspecified, st, sourceFile)).join('\n')

    // Kompilacja offline z TS do czystego JS w przeglądarce
    const jsCompiled = ts.transpileModule(tsCode, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
    })

    return jsCompiled.outputText
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

      // --- NOWY KLOCEK: Wyświetl / Zmień Tekst (obsługuje 'display-text' lub 'set-text') ---
      case 'display-text':
      case 'set-text': {
        const textId = this.resolvePort(nodeId, 'textId')
        const content = this.resolvePort(nodeId, 'content')

        // Generuje kod: const t = this.texts.get(textId); if (t) t.setText(String(content));
        statements.push(
          ts.factory.createVariableStatement(
            undefined,
            ts.factory.createVariableDeclarationList([
              ts.factory.createVariableDeclaration('t', undefined, undefined,
                ts.factory.createCallExpression(
                  ts.factory.createPropertyAccessExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('this'), 'texts'), 'get'),
                  undefined, [textId]
                )
              )
            ], ts.NodeFlags.Const)
          ),
          ts.factory.createIfStatement(
            ts.factory.createIdentifier('t'),
            ts.factory.createBlock([
              ts.factory.createExpressionStatement(
                ts.factory.createCallExpression(
                  ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('t'), 'setText'),
                  undefined,
                  [ts.factory.createCallExpression(ts.factory.createIdentifier('String'), undefined, [content])]
                )
              )
            ], true)
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
            const spriteId = String(fromNode.props.spriteId ?? fromNode.props.target ?? '')
            const property = String(fromNode.props.property ?? 'x')
            
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