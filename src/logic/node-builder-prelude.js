// Preambuła wstrzykiwana przed kodem użytkownika podczas rejestracji węzła.
// Dostarcza klasę Node i automatycznie przechwytuje wszystkie stworzone węzły.

const __nodes = [];

class Node {
  constructor(type, label, icon) {
    this._type     = String(type || 'custom-node');
    this._label    = String(label || type || 'Węzeł');
    this._icon     = String(icon || '⭐');
    this._category = 'action';
    this._inputs   = [{ id: 'exec', label: '', type: 'exec' }];
    this._outputs  = [{ id: 'exec', label: '', type: 'exec' }];
    this._props    = {};
    this.Execute   = null;
    __nodes.push(this);
  }

  // Ustawia kategorię: 'event' | 'action' | 'value'
  category(cat) { this._category = cat; return this; }

  // Dodaje port wejściowy (drut) — typ: 'string' | 'number' | 'bool' | 'exec'
  input(name, type, label) {
    const t = { any:'number', text:'string', tekst:'string', liczba:'number', bool:'bool' }[type] || type || 'number';
    this._inputs.push({ id: name, label: label || name, type: t });
    return this;
  }

  // Dodaje port wyjściowy
  output(name, type, label) {
    const t = { any:'number', text:'string', tekst:'string', liczba:'number', bool:'bool' }[type] || type || 'number';
    this._outputs.push({ id: name, label: label || name, type: t });
    return this;
  }

  // Dodaje pole edytowalne w UI węzła (bez drutu)
  prop(name, label, defaultValue, options) {
    this._props[name] = { label: label || name, defaultValue: defaultValue ?? 0 };
    if (options) this._props[name].options = options;
    return this;
  }

  // Usuwa domyślny exec input (dla węzłów wartości)
  noExecIn()  { this._inputs  = this._inputs.filter(p => p.id !== 'exec'); return this; }

  // Usuwa domyślny exec output (dla węzłów wartości/warunków)
  noExecOut() { this._outputs = this._outputs.filter(p => p.id !== 'exec'); return this; }

  // Alias dla .Execute = fn
  run(fn) { this.Execute = fn; return this; }

  _build(helpers) {
    if (!this.Execute) throw new Error(`Węzeł "${this._type}" nie ma funkcji Execute.`);
    const def = {
      type:      this._type,
      label:     this._label,
      icon:      this._icon,
      category:  this._category,
      inputs:    this._inputs,
      outputs:   this._outputs,
      props:     this._props,
      runSource: this.Execute.toString()
    };
    if (helpers && Object.keys(helpers).length > 0) def.helpers = helpers;
    return def;
  }
}
