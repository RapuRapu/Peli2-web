export const LOG_LIMIT = 50;
const COLLAPSED_LINES = 4;
export const LOG_KINDS = ['combat', 'loot', 'build', 'progress', 'helper', 'discovery', 'notice', 'chat', 'system'];

const clockText = (date) => date.toTimeString().slice(0, 8);

export function createGameLog(parent, { localAuthor = 'You', transport = null } = {}) {
  const entries = [];
  const commands = new Map();
  let filter = null;
  let expanded = false;
  let nextId = 1;

  const root = document.createElement('div');
  root.className = 'game-log';
  const lines = document.createElement('div');
  lines.className = 'log-lines';
  const form = document.createElement('form');
  form.className = 'log-form';
  const input = document.createElement('input');
  input.className = 'log-input';
  input.type = 'text';
  input.maxLength = 160;
  input.placeholder = 'Type here, /help for commands';
  input.enterKeyHint = 'send';
  form.append(input);
  root.append(lines, form);
  parent.append(root);
  queueMicrotask(render);

  const send = transport ? transport.send : (message) => receive(message);

  function receive(message) {
    entries.push({ id: nextId++, time: new Date(), ...message });
    while (entries.length > LOG_LIMIT) entries.shift();
    render();
  }

  function post(kind, text) {
    receive({ kind, author: null, text });
  }

  function render() {
    const visible = entries.filter((entry) => !filter || entry.kind === filter || entry.kind === 'system');
    const shown = expanded ? visible : visible.slice(-COLLAPSED_LINES);
    lines.replaceChildren(...shown.map((entry) => {
      const line = document.createElement('div');
      line.className = `log-line log-${entry.kind}`;
      if (expanded || entry.kind === 'chat') {
        const stamp = document.createElement('span');
        stamp.className = 'log-time';
        stamp.textContent = clockText(entry.time);
        line.append(stamp);
      }
      if (entry.author) {
        const author = document.createElement('span');
        author.className = 'log-author';
        author.textContent = `${entry.author}:`;
        line.append(author);
      }
      line.append(document.createTextNode(entry.text));
      return line;
    }));
    if (!shown.length) {
      const hint = document.createElement('div');
      hint.className = 'log-line log-hint';
      hint.textContent = 'Log — tap to open';
      lines.append(hint);
    }
    if (expanded) lines.scrollTop = lines.scrollHeight;
  }

  function setExpanded(value) {
    expanded = value;
    root.classList.toggle('expanded', expanded);
    if (!expanded) input.blur();
    render();
  }

  function registerCommand(name, description, run) {
    commands.set(name, { description, run });
  }

  function submit(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('/')) {
      const [name, ...args] = trimmed.slice(1).split(/\s+/);
      const command = commands.get(name.toLowerCase());
      if (command) command.run(args);
      else post('system', `Unknown command /${name} — try /help`);
      return;
    }
    send({ kind: 'chat', author: localAuthor, text: trimmed });
  }

  registerCommand('help', 'list commands', () => {
    for (const [name, command] of commands) post('system', `/${name} — ${command.description}`);
  });
  registerCommand('clear', 'empty the log', () => {
    entries.length = 0;
    render();
  });
  registerCommand('filter', `show one kind (${LOG_KINDS.join(', ')}) or all`, ([kind]) => {
    filter = LOG_KINDS.includes(kind) ? kind : null;
    post('system', filter ? `Showing ${filter} only` : 'Showing everything');
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit(input.value);
    input.value = '';
  });
  lines.addEventListener('click', () => setExpanded(!expanded));
  input.addEventListener('focus', () => {
    if (!expanded) setExpanded(true);
  });
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') setExpanded(false);
  });
  input.addEventListener('keyup', (event) => event.stopPropagation());

  return { root, post, submit, receive, registerCommand, entries, setExpanded, get expanded() { return expanded; } };
}
