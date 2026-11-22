const $ = id => document.getElementById(id);
const chat = $('chat');
const scroll = $('scroll');
const historyList = $('history');
const chatKey = 'morrowmesh.chats.v1';
const activeKey = 'morrowmesh.activeChat.v1';
let busy = false;
let attachment = null;
let conversations = [];
let activeChatId = null;
let editTarget = null;

try {
  conversations = JSON.parse(localStorage.getItem(chatKey) || '[]');
} catch {
  conversations = [];
}

function initializeModelPicker() {
  document.querySelector('.compose-hint').textContent = 'Morrowmesh AI · streams replies';
  $('notice').innerHTML = '<b>Morrowmesh AI</b> · ready to chat';
  const configured = Boolean(String(window.MORROWMESH_API_URL || '').trim());
  $('modelMenuNote').textContent = configured
    ? 'Secure AI connection is ready. Visitors do not need an API key.'
    : 'The app owner needs to set up the free Worker URL once before chat is available.';
  setNetworkState();
}

initializeModelPicker();

const sidebar = $('sidebar');
const sidebarToggle = $('toggleSidebar');
const mobileLayout = window.matchMedia('(max-width: 720px)');
sidebarToggle.addEventListener('click', () => {
  if (mobileLayout.matches) {
    sidebar.classList.toggle('mobile-expanded');
    const expanded = sidebar.classList.contains('mobile-expanded');
    sidebarToggle.setAttribute('aria-expanded', String(expanded));
    sidebarToggle.setAttribute('aria-label', expanded ? 'Collapse sidebar' : 'Expand sidebar');
    sidebarToggle.title = expanded ? 'Collapse sidebar' : 'Expand sidebar';
  } else {
    sidebar.classList.toggle('collapsed');
    const expanded = !sidebar.classList.contains('collapsed');
    sidebarToggle.setAttribute('aria-expanded', String(expanded));
    sidebarToggle.setAttribute('aria-label', expanded ? 'Collapse sidebar' : 'Expand sidebar');
    sidebarToggle.title = expanded ? 'Collapse sidebar' : 'Expand sidebar';
  }
});

const modelMenuButton = $('modelMenuButton');
const modelMenu = $('modelMenu');
function closeModelMenu() {
  modelMenu.hidden = true;
  modelMenuButton.setAttribute('aria-expanded', 'false');
}
modelMenuButton.addEventListener('click', () => {
  const open = modelMenu.hidden;
  modelMenu.hidden = !open;
  modelMenuButton.setAttribute('aria-expanded', String(open));
  if (open) $('modelMenuNote').focus();
});
document.addEventListener('pointerdown', event => {
  if (!modelMenu.hidden && !modelMenu.contains(event.target) && !modelMenuButton.contains(event.target)) closeModelMenu();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeModelMenu();
});

function persistChats() {
  try {
    localStorage.setItem(chatKey, JSON.stringify(conversations));
    if (activeChatId) localStorage.setItem(activeKey, activeChatId);
    else localStorage.removeItem(activeKey);
  } catch {
    $('notice').textContent = 'Could not save chat history in this browser.';
  }
}

function scrollToEnd() {
  requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\*\*/g, '')
    .replace(/(^|\s)\*(?=\s|$)/g, '$1');
}

function renderAssistantText(value) {
  const lines = String(value).replace(/\r/g, '').split('\n');
  const blocks = [];
  let codeLines = null;
  let hasMainHeading = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (codeLines) {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = null;
      } else codeLines = [];
      continue;
    }
    if (codeLines) { codeLines.push(line); continue; }
    if (!line.trim()) continue;
    const markdownHeading = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (markdownHeading) {
      const isSubheading = markdownHeading[1].length === 3 || hasMainHeading;
      blocks.push(`<h${isSubheading ? '3' : '2'}>${formatInlineMarkdown(markdownHeading[2])}</h${isSubheading ? '3' : '2'}>`);
      hasMainHeading = true;
      continue;
    }
    const boldHeading = line.match(/^\s*\*\*(.+?)\*\*\s*$/);
    if (boldHeading) {
      const tag = hasMainHeading ? 'h3' : 'h2';
      blocks.push(`<${tag}>${formatInlineMarkdown(boldHeading[1])}</${tag}>`);
      hasMainHeading = true;
      continue;
    }
    const point = line.match(/^\s*(?:(\d+)\.|[-*])\s+\*\*(.+?)\*\*\s*:?\s*(.*)$/)
      || line.match(/^\s*\*\*(.+?)\*\*\s*:\s*(.*)$/);
    if (point) {
      const numbered = point.length === 4;
      const heading = numbered ? `${point[1] ? `${point[1]}. ` : ''}${point[2]}` : point[1];
      const answer = numbered ? point[3] : point[2];
      blocks.push(`<section class="answer-point"><h3>${formatInlineMarkdown(heading)}</h3>${answer ? `<p>${formatInlineMarkdown(answer)}</p>` : ''}</section>`);
      continue;
    }
    const numberedItem = line.match(/^\s*(\d+)\.\s+(.+)$/);
    const bulletItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (numberedItem || bulletItem) {
      const marker = numberedItem ? `${numberedItem[1]}.` : '•';
      const content = numberedItem ? numberedItem[2] : bulletItem[1];
      blocks.push(`<p class="answer-list-item"><span>${marker}</span>${formatInlineMarkdown(content)}</p>`);
      continue;
    }
    blocks.push(`<p>${formatInlineMarkdown(line)}</p>`);
  }
  if (codeLines) blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  return blocks.join('');
}

function addMessage(role, text, meta = '', error = false, index = null) {
  const row = document.createElement('div');
  row.className = `message ${role}`;
  if (index !== null) row.dataset.messageIndex = String(index);
  if (role === 'assistant') {
    const mark = document.createElement('div');
    mark.className = 'msgmark';
    mark.textContent = '⌁';
    row.append(mark);
  }
  const content = document.createElement('div');
  content.className = 'message-content';
  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (error ? ' errorbubble' : '');
  if (role === 'assistant' && !error) bubble.innerHTML = renderAssistantText(text);
  else bubble.textContent = text;
  if (meta) {
    const label = document.createElement('div');
    label.className = 'meta';
    label.textContent = role === 'assistant' ? 'Morrowmesh AI' : meta;
    bubble.append(label);
  }
  content.append(bubble);
  row.append(content);
  if (index !== null) addMessageActions(row, role, text, index, activeChatId, error);
  chat.append(row);
  scrollToEnd();
  return row;
}

function addMessageActions(row, role, text, index, chatId, error = false) {
  if (!text) return;
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'message-action';
  copy.textContent = 'Copy';
  copy.title = 'Copy message text';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      $('notice').textContent = 'Message copied.';
    } catch {
      $('notice').textContent = 'Could not copy message text in this browser.';
    }
  });
  actions.append(copy);
  if (role === 'user' && !error) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'message-action';
    edit.textContent = 'Edit';
    edit.title = 'Edit and resend this message';
    edit.addEventListener('click', () => beginEdit(chatId, index));
    actions.append(edit);
  }
  row.querySelector('.message-content').append(actions);
}

function beginEdit(chatId, index) {
  const item = conversations.find(conversation => conversation.id === chatId);
  const message = item?.messages[index];
  if (!message || message.role !== 'user') return;
  activeChatId = chatId;
  editTarget = { chatId, index };
  const attached = message.contextText?.match(/^(.*?)\n\n\[Attached text file: (.*?)\]\n([\s\S]*)$/);
  attachment = attached ? { name: attached[2], text: attached[3] } : null;
  $('prompt').value = attached ? attached[1] : message.text.replace(/\n📎 [^\n]*$/, '');
  $('prompt').dispatchEvent(new Event('input'));
  $('editNotice').hidden = false;
  showAttachment();
  renderHistory();
  $('prompt').focus();
}

function cancelEdit() {
  editTarget = null;
  $('editNotice').hidden = true;
  attachment = null;
  showAttachment();
}

function renderHistory() {
  historyList.replaceChildren();
  const query = $('historySearch').value.trim().toLocaleLowerCase();
  const matches = [...conversations]
    .filter(item => {
      const searchableText = [item.title, ...(item.messages || []).flatMap(message => [message.text, message.contextText])]
        .filter(Boolean).join('\n').toLocaleLowerCase();
      return !query || searchableText.includes(query);
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  for (const item of matches) {
    const button = document.createElement('button');
    button.textContent = item.title || 'New chat';
    button.title = item.title || 'New chat';
    button.className = item.id === activeChatId ? 'active' : '';
    button.addEventListener('click', () => openChat(item.id));
    historyList.append(button);
  }
  $('historyLabel').textContent = query ? 'SEARCH RESULTS' : 'RECENT';
  const empty = $('historyEmpty');
  empty.hidden = matches.length > 0;
  empty.textContent = conversations.length === 0
    ? 'Your chats will appear here.'
    : query ? 'No chats match that search.' : '';
}

function clearMessages() {
  for (const element of [...chat.children]) {
    if (element.id !== 'welcome') element.remove();
  }
}

function openChat(id) {
  const item = conversations.find(conversation => conversation.id === id);
  if (!item) return;
  if (editTarget && editTarget.chatId !== id) cancelEdit();
  activeChatId = id;
  clearMessages();
  $('welcome').style.display = item.messages.length ? 'none' : '';
  item.messages.forEach((message, index) => {
    addMessage(message.role, message.text, message.meta || '', Boolean(message.error), index);
  });
  persistChats();
  renderHistory();
}

function startNewChat() {
  cancelEdit();
  activeChatId = null;
  clearMessages();
  $('welcome').style.display = '';
  $('prompt').value = '';
  $('prompt').style.height = 'auto';
  attachment = null;
  showAttachment();
  persistChats();
  renderHistory();
  $('prompt').focus();
}

function getActiveChat(firstText) {
  let item = conversations.find(conversation => conversation.id === activeChatId);
  if (!item) {
    const id = globalThis.crypto?.randomUUID?.() || String(Date.now());
    item = {
      id,
      title: firstText.slice(0, 34) + (firstText.length > 34 ? '…' : ''),
      messages: [],
      updatedAt: Date.now()
    };
    conversations.unshift(item);
    activeChatId = id;
  }
  return item;
}

function saveMessage(item, message) {
  item.messages.push(message);
  item.updatedAt = Date.now();
  persistChats();
  renderHistory();
}

function setNetworkState() {
  const connected = Boolean(String(window.MORROWMESH_API_URL || '').trim());
  $('networkDot').style.background = connected ? '#83d7aa' : '#777';
  $('networkDot').title = connected ? 'Secure AI connection ready' : 'Worker URL not configured';
}

function showAttachment() {
  const chip = $('attachmentChip');
  chip.replaceChildren();
  chip.hidden = !attachment;
  if (!attachment) return;
  chip.append(document.createTextNode(`📎 ${attachment.name} `));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '×';
  remove.title = 'Remove attachment';
  remove.addEventListener('click', () => { attachment = null; showAttachment(); });
  chip.append(remove);
}

$('attach').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 20000) {
    $('notice').textContent = 'Text attachments must be smaller than 20 KB.';
    event.target.value = '';
    return;
  }
  try {
    attachment = { name: file.name, text: await file.text() };
    showAttachment();
  } catch {
    $('notice').textContent = 'Could not read that file.';
  }
  event.target.value = '';
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
$('mic').addEventListener('click', () => {
  if (!SpeechRecognition) {
    $('notice').textContent = 'Voice input is not supported in this browser.';
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.onresult = event => {
    const prompt = $('prompt');
    prompt.value = (prompt.value ? `${prompt.value} ` : '') + event.results[0][0].transcript;
    prompt.dispatchEvent(new Event('input'));
  };
  recognition.onerror = () => { $('notice').textContent = 'Voice input did not complete.'; };
  recognition.start();
});

$('newChat').addEventListener('click', startNewChat);
$('historySearch').addEventListener('input', renderHistory);
$('historySearch').addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  renderHistory();
  const firstResult = historyList.querySelector('button');
  if (firstResult) firstResult.click();
  else $('historyEmpty').textContent = 'No chats match that search.';
});
$('clearHistorySearch').addEventListener('click', () => {
  $('historySearch').value = '';
  renderHistory();
  $('historySearch').focus();
});
document.querySelectorAll('.suggestion').forEach(button => {
  button.addEventListener('click', () => {
    $('prompt').value = button.dataset.prompt;
    sendMessage();
  });
});

async function streamAssistantAnswer(messages, bubble) {
  const apiUrl = String(window.MORROWMESH_API_URL || '').trim().replace(/\/$/, '');
  if (!apiUrl) throw new Error('The Morrowmesh owner needs to configure the Worker URL before chat is available.');
  let response;
  try {
    response = await fetch(`${apiUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });
  } catch {
    throw new Error('Could not reach the Morrowmesh AI service. Check your internet connection and try again.');
  }
  if (!response.ok) {
    let message = `AI request failed (${response.status}).`;
    try { message = (await response.json()).error || message; } catch { /* Keep the readable fallback. */ }
    if (response.status === 429) message = 'The AI service is temporarily busy. Please wait and try again later.';
    throw new Error(message);
  }
  if (!response.body) throw new Error('The AI service returned no response stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let answer = '';
  const consumeEvent = event => {
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      let payload;
      try { payload = JSON.parse(raw); } catch { continue; }
      if (payload.error) throw new Error(payload.error);
      answer += payload.response || payload.choices?.[0]?.delta?.content || '';
    }
    if (answer) {
      bubble.innerHTML = renderAssistantText(answer);
      scrollToEnd();
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = pending.split(/\r?\n\r?\n/);
    pending = events.pop() || '';
    for (const event of events) consumeEvent(event);
    if (done) break;
  }
  if (pending.trim()) consumeEvent(pending);
  if (!answer.trim()) throw new Error('The AI service returned an empty answer. Try sending again.');
  return answer;
}

async function sendMessage() {
  if (busy) return;
  const text = $('prompt').value.trim();
  if (!text) return;
  const attached = attachment;
  const prompt = attached ? `${text}\n\n[Attached text file: ${attached.name}]\n${attached.text}` : text;
  const shownText = attached ? `${text}\n📎 ${attached.name}` : text;
  busy = true;
  $('welcome').style.display = 'none';
  $('prompt').value = '';
  $('prompt').style.height = 'auto';
  const target = editTarget && editTarget.chatId === activeChatId ? editTarget : null;
  const item = target
    ? conversations.find(conversation => conversation.id === target.chatId)
    : getActiveChat(text);
  if (!item) return;
  if (target) {
    item.messages.splice(target.index);
    for (const row of [...chat.querySelectorAll('.message[data-message-index]')]) {
      if (Number(row.dataset.messageIndex) >= target.index) row.remove();
    }
    editTarget = null;
    $('editNotice').hidden = true;
  }
  const history = item.messages
    .filter(message => !message.error && ['user', 'assistant'].includes(message.role))
    .slice(-12)
    .map(message => ({ role: message.role, content: message.contextText || message.text }));
  saveMessage(item, { role: 'user', text: shownText, contextText: prompt });
  addMessage('user', shownText, '', false, item.messages.length - 1);
  attachment = null;
  showAttachment();
  const thinking = addMessage('assistant', '');
  const bubble = thinking.querySelector('.bubble');
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  $('send').disabled = true;
  try {
    $('notice').textContent = 'Connecting to Morrowmesh AI…';
    const modelMessages = [
      ...history,
      { role: 'user', content: prompt }
    ];
    const answer = await streamAssistantAnswer(modelMessages, bubble);
    const meta = 'Morrowmesh AI';
    bubble.innerHTML = renderAssistantText(answer);
    const label = document.createElement('div');
    label.className = 'meta';
    label.textContent = meta;
    bubble.append(label);
    saveMessage(item, { role: 'assistant', text: answer, meta });
    thinking.dataset.messageIndex = String(item.messages.length - 1);
    addMessageActions(thinking, 'assistant', answer, item.messages.length - 1, item.id);
  } catch (error) {
    thinking.remove();
    const meta = 'Morrowmesh AI';
    const reason = error.message || 'Morrowmesh AI could not answer right now. Please try again.';
    $('notice').textContent = reason;
    saveMessage(item, { role: 'assistant', text: reason, meta, error: true });
    addMessage('assistant', reason, meta, true, item.messages.length - 1);
  } finally {
    busy = false;
    $('send').disabled = false;
    $('prompt').focus();
    setNetworkState();
  }
}

$('cancelEdit').addEventListener('click', () => {
  cancelEdit();
  $('prompt').value = '';
  $('prompt').style.height = 'auto';
  $('prompt').focus();
});

$('send').addEventListener('click', sendMessage);
$('prompt').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});
$('prompt').addEventListener('input', event => {
  event.target.style.height = 'auto';
  event.target.style.height = Math.min(event.target.scrollHeight, 180) + 'px';
});

renderHistory();
let savedId = null;
try { savedId = localStorage.getItem(activeKey); } catch { /* Storage may be disabled for file URLs. */ }
const startupChat = conversations.find(item => item.id === savedId)
  || [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
if (startupChat) openChat(startupChat.id);
