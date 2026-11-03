/**
 * Module that shows the chat of the current SyncPlay group.
 * @module components/syncPlay/ui/chatPanel
 */

import globalize from '../../../lib/globalize';
import toast from '../../../components/toast/toast';
import Events from '../../../utils/events.ts';

import './chatPanel.scss';

const MaxMessageLength = 1000;

class ChatPanel {
    constructor() {
        this.manager = null;
        this.button = null;
        this.badge = null;
        this.panel = null;
        this.title = null;
        this.messages = null;
        this.input = null;
        this.unread = 0;
    }

    /**
     * Binds the panel to the SyncPlay manager.
     * @param {Object} manager The SyncPlay manager.
     */
    bind(manager) {
        this.manager = manager;

        Events.on(manager, 'enabled', (_event, enabled) => {
            if (enabled) {
                this.show();
            } else {
                this.remove();
            }
        });
        Events.on(manager, 'group-update', () => this.updateTitle());
        Events.on(manager, 'chat-messages', (_event, newMessages) => this.onMessages(newMessages));
    }

    show() {
        if (this.button) return;

        this.button = document.createElement('button');
        this.button.type = 'button';
        this.button.className = 'syncPlayChatButton';
        this.button.title = globalize.translate('LabelSyncPlayChat');
        this.button.setAttribute('aria-label', this.button.title);
        const icon = document.createElement('span');
        icon.className = 'material-icons chat';
        icon.setAttribute('aria-hidden', 'true');
        this.button.appendChild(icon);
        this.badge = document.createElement('span');
        this.badge.className = 'syncPlayChatBadge hide';
        this.button.appendChild(this.badge);
        this.button.addEventListener('click', () => this.toggle());

        this.panel = document.createElement('div');
        this.panel.className = 'syncPlayChatPanel hide';
        this.title = document.createElement('div');
        this.title.className = 'syncPlayChatTitle';
        this.messages = document.createElement('div');
        this.messages.className = 'syncPlayChatMessages';
        this.messages.setAttribute('role', 'log');
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'syncPlayChatInput';
        this.input.maxLength = MaxMessageLength;
        this.input.placeholder = globalize.translate('LabelSyncPlayChatPlaceholder');
        this.input.setAttribute('aria-label', this.input.placeholder);
        this.panel.append(this.title, this.messages, this.input);

        // Typing must not reach the keyboard shortcuts of the player.
        for (const type of ['keydown', 'keypress', 'keyup']) {
            this.panel.addEventListener(type, (event) => event.stopPropagation());
        }
        this.input.addEventListener('keydown', (event) => this.onInputKeyDown(event));

        document.body.append(this.panel, this.button);
        this.updateTitle();
        this.renderMessages(this.manager.getChatMessages());
    }

    remove() {
        this.button?.remove();
        this.panel?.remove();
        this.button = null;
        this.panel = null;
        this.unread = 0;
    }

    /** Opens the panel, or closes it if already open. */
    toggle() {
        if (!this.panel) return;

        const open = this.panel.classList.toggle('hide') === false;
        if (open) {
            this.setUnread(0);
            this.messages.scrollTop = this.messages.scrollHeight;
            this.input.focus();
        }
    }

    /** Opens the panel. */
    open() {
        if (this.panel?.classList.contains('hide')) this.toggle();
    }

    isOpen() {
        return !!this.panel && !this.panel.classList.contains('hide');
    }

    setUnread(count) {
        this.unread = count;
        this.badge.textContent = count > 99 ? '99+' : String(count);
        this.badge.classList.toggle('hide', count === 0);
    }

    updateTitle() {
        if (this.title) {
            this.title.textContent = this.manager.getGroupInfo()?.GroupName ?? '';
        }
    }

    onMessages(newMessages) {
        if (!this.panel) return;

        // History can arrive after newer messages, so the list is rendered from the sorted messages.
        this.messages.textContent = '';
        this.renderMessages(this.manager.getChatMessages());

        if (!this.isOpen()) {
            this.setUnread(this.unread + newMessages.length);
        }
    }

    renderMessages(messages) {
        for (const { UserName, Text, SentAt } of messages) {
            const row = document.createElement('div');
            row.className = 'syncPlayChatMessage';
            row.title = new Date(SentAt).toLocaleTimeString();

            const sender = document.createElement('span');
            sender.className = 'syncPlayChatSender';
            sender.textContent = UserName;

            row.append(sender, Text);
            this.messages.appendChild(row);
        }

        this.messages.scrollTop = this.messages.scrollHeight;
    }

    onInputKeyDown(event) {
        if (event.key === 'Escape') {
            this.toggle();
            return;
        }

        if (event.key !== 'Enter') return;

        event.preventDefault();
        const text = this.input.value.trim();
        if (!text) return;

        this.input.value = '';
        this.manager.sendChatMessage(text).catch((error) => {
            console.error('SyncPlay: failed to send chat message:', error);
            // Keep the text, unless something new has been typed in the meantime.
            if (this.input && !this.input.value) this.input.value = text;
            toast(globalize.translate(error?.status === 429 ? 'MessageSyncPlayChatRateLimited' : 'MessageSyncPlayChatFailed'));
        });
    }
}

/** ChatPanel singleton. */
const chatPanel = new ChatPanel();
export default chatPanel;
