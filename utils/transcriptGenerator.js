/**
 * HTML Transcript Generator
 * Creates beautiful, professional HTML transcripts for ticket conversations
 */

function generateHTMLTranscript(ticket, messages, closedBy, config) {
  const createdDate = new Date(ticket.created_at);
  const closedDate = new Date(ticket.closed_at);
  const duration = formatDuration(closedDate - createdDate);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ticket #${String(ticket.ticket_num).padStart(4, '0')} - Transcript</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            line-height: 1.6;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }

        .header .ticket-id {
            font-size: 16px;
            opacity: 0.9;
            font-weight: 300;
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
            border-bottom: 2px solid #e9ecef;
        }

        .info-item {
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .info-label {
            font-size: 12px;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
            font-weight: 600;
        }

        .info-value {
            font-size: 16px;
            color: #212529;
            font-weight: 500;
        }

        .messages {
            padding: 30px;
            max-height: 800px;
            overflow-y: auto;
        }

        .message {
            margin-bottom: 20px;
            animation: fadeIn 0.3s ease-in;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message-header {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
        }

        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 16px;
            margin-right: 12px;
            flex-shrink: 0;
        }

        .message-info {
            flex: 1;
        }

        .author-name {
            font-weight: 600;
            color: #212529;
            font-size: 15px;
        }

        .author-tag {
            color: #6c757d;
            font-size: 13px;
            margin-left: 6px;
        }

        .timestamp {
            font-size: 12px;
            color: #adb5bd;
        }

        .message-content {
            background: #f8f9fa;
            padding: 12px 16px;
            border-radius: 8px;
            margin-left: 52px;
            color: #212529;
            word-wrap: break-word;
            white-space: pre-wrap;
        }

        .attachment {
            display: inline-block;
            background: #e7f3ff;
            color: #0066cc;
            padding: 8px 12px;
            border-radius: 6px;
            text-decoration: none;
            margin-top: 8px;
            font-size: 14px;
            transition: background 0.2s;
        }

        .attachment:hover {
            background: #cce5ff;
        }

        .attachment::before {
            content: "📎 ";
        }

        .footer {
            background: #f8f9fa;
            padding: 20px 30px;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
            border-top: 2px solid #e9ecef;
        }

        .footer strong {
            color: #212529;
        }

        .badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .badge-success {
            background: #d4edda;
            color: #155724;
        }

        .badge-info {
            background: #d1ecf1;
            color: #0c5460;
        }

        .badge-warning {
            background: #fff3cd;
            color: #856404;
        }

        /* Scrollbar styling */
        .messages::-webkit-scrollbar {
            width: 8px;
        }

        .messages::-webkit-scrollbar-track {
            background: #f1f1f1;
        }

        .messages::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 4px;
        }

        .messages::-webkit-scrollbar-thumb:hover {
            background: #555;
        }

        /* Print styles */
        @media print {
            body {
                background: white;
                padding: 0;
            }

            .container {
                box-shadow: none;
            }

            .messages {
                max-height: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎫 Support Ticket Transcript</h1>
            <div class="ticket-id">Ticket #${String(ticket.ticket_num).padStart(4, '0')}</div>
        </div>

        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">👤 Opened By</div>
                <div class="info-value">${escapeHtml(ticket.user_tag)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">📋 Category</div>
                <div class="info-value">${escapeHtml(ticket.category)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">📅 Created</div>
                <div class="info-value">${createdDate.toLocaleString()}</div>
            </div>
            <div class="info-item">
                <div class="info-label">📅 Closed</div>
                <div class="info-value">${closedDate.toLocaleString()}</div>
            </div>
            <div class="info-item">
                <div class="info-label">⏱️ Duration</div>
                <div class="info-value">${duration}</div>
            </div>
            <div class="info-item">
                <div class="info-label">💬 Total Messages</div>
                <div class="info-value">${messages.length}</div>
            </div>
            <div class="info-item">
                <div class="info-label">✋ Handled By</div>
                <div class="info-value">${ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Unclaimed'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">🔒 Closed By</div>
                <div class="info-value">${escapeHtml(closedBy.tag)}</div>
            </div>
        </div>

        <div class="messages">
            ${messages.map(msg => generateMessageHTML(msg)).join('')}
        </div>

        <div class="footer">
            <p>Generated on ${new Date().toLocaleString()}</p>
            <p style="margin-top: 10px;">
                <strong>Ticket System</strong> • Professional Support Management
            </p>
        </div>
    </div>
</body>
</html>
`;

  return html;
}

function generateMessageHTML(msg) {
  const initial = msg.author.username ? msg.author.username[0].toUpperCase() : '?';
  const timestamp = msg.createdAt.toLocaleString();

  let attachmentsHTML = '';
  if (msg.attachments.size > 0) {
    attachmentsHTML = Array.from(msg.attachments.values())
      .map(att => `<a href="${escapeHtml(att.url)}" class="attachment" target="_blank">${escapeHtml(att.name)}</a>`)
      .join(' ');
  }

  return `
    <div class="message">
        <div class="message-header">
            <div class="avatar">${initial}</div>
            <div class="message-info">
                <div>
                    <span class="author-name">${escapeHtml(msg.author.username || msg.author.tag)}</span>
                    <span class="author-tag">${escapeHtml(msg.author.discriminator !== '0' ? '#' + msg.author.discriminator : '')}</span>
                </div>
                <div class="timestamp">${timestamp}</div>
            </div>
        </div>
        ${msg.content ? `<div class="message-content">${escapeHtml(msg.content)}</div>` : ''}
        ${attachmentsHTML ? `<div style="margin-left: 52px; margin-top: 8px;">${attachmentsHTML}</div>` : ''}
    </div>
  `;
}

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.toString().replace(/[&<>"']/g, m => map[m]);
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

module.exports = {
  generateHTMLTranscript
};
