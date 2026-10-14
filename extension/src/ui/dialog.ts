// Shadow DOM dialog to ensure our UI is completely isolated from the AI site's CSS.

interface DialogCallbacks {
  onSendAnyway: () => void;
  onRedactAndSend: () => void;
}

export function showDialog(action: 'WARN' | 'BLOCK', types: string[], callbacks: DialogCallbacks) {
  const { onSendAnyway, onRedactAndSend } = callbacks;
  // Remove existing dialog if any
  const existing = document.getElementById('shadowai-dialog-host');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 'shadowai-dialog-host';
  host.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    z-index: 999999; display: flex; align-items: center; justify-content: center;
    background-color: rgba(0,0,0,0.5);
  `;
  
  const shadow = host.attachShadow({ mode: 'open' });
  
  const isBlock = action === 'BLOCK';
  const title = isBlock ? 'Submission Blocked' : 'Sensitive Data Detected';
  const message = isBlock 
    ? `You are trying to send ${types.join(', ')}. This is blocked by your company policy.`
    : `Your message contains ${types.join(', ')}. What would you like to do?`;

  shadow.innerHTML = `
    <style>
      .dialog {
        background: white; padding: 24px; border-radius: 12px; max-width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2); text-align: center;
      }
      h2 { margin: 0 0 12px 0; color: ${isBlock ? '#dc2626' : '#d97706'}; font-size: 20px; }
      p { margin: 0 0 24px 0; color: #4b5563; line-height: 1.5; font-size: 14px; }
      .actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
      button {
        padding: 10px 20px; border-radius: 6px; border: none;
        font-weight: 600; cursor: pointer; font-size: 14px; transition: background 0.2s;
      }
      .btn-primary { background: #2563eb; color: white; }
      .btn-primary:hover { background: #1d4ed8; }
      .btn-secondary { background: #e5e7eb; color: #374151; }
      .btn-secondary:hover { background: #d1d5db; }
      .btn-danger { background: #dc2626; color: white; }
      .btn-danger:hover { background: #b91c1c; }
    </style>
    <div class="dialog">
      <h2>${title}</h2>
      <p>${message}</p>
      <div class="actions">
        ${!isBlock ? `<button class="btn-primary" id="btn-redact">Redact & Send</button>` : ''}
        ${!isBlock ? `<button class="btn-danger" id="btn-send">Send Anyway</button>` : ''}
        <button class="btn-secondary" id="btn-cancel">${isBlock ? 'Close' : 'Cancel'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(host);

  const close = () => host.remove();

  shadow.getElementById('btn-cancel')?.addEventListener('click', close);
  
  if (!isBlock) {
    shadow.getElementById('btn-send')?.addEventListener('click', () => {
      close();
      onSendAnyway();
    });
    
    shadow.getElementById('btn-redact')?.addEventListener('click', () => {
      close();
      onRedactAndSend();
    });
  }
}
