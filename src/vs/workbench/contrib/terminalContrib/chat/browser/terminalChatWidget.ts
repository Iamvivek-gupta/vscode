/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, IFocusTracker, trackFocus } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/terminalChatWidget';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IChatProgress } from 'vs/workbench/contrib/chat/common/chatService';
import { InlineChatWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { MENU_TERMINAL_CHAT_INPUT, MENU_TERMINAL_CHAT_WIDGET, MENU_TERMINAL_CHAT_WIDGET_FEEDBACK, MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatContextKeys } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';

export class TerminalChatWidget extends Disposable {

	private readonly _container: HTMLElement;

	private readonly _inlineChatWidget: InlineChatWidget;
	public get inlineChatWidget(): InlineChatWidget { return this._inlineChatWidget; }

	private readonly _focusTracker: IFocusTracker;

	private readonly _focusedContextKey: IContextKey<boolean>;
	private readonly _visibleContextKey: IContextKey<boolean>;

	constructor(
		terminalElement: HTMLElement,
		private readonly _instance: ITerminalInstance,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();

		this._focusedContextKey = TerminalChatContextKeys.focused.bindTo(this._contextKeyService);
		this._visibleContextKey = TerminalChatContextKeys.visible.bindTo(this._contextKeyService);

		this._container = document.createElement('div');
		this._container.classList.add('terminal-inline-chat');
		terminalElement.appendChild(this._container);

		this._inlineChatWidget = this._instantiationService.createInstance(
			InlineChatWidget,
			{
				inputMenuId: MENU_TERMINAL_CHAT_INPUT,
				widgetMenuId: MENU_TERMINAL_CHAT_WIDGET,
				statusMenuId: MENU_TERMINAL_CHAT_WIDGET_STATUS,
				feedbackMenuId: MENU_TERMINAL_CHAT_WIDGET_FEEDBACK,
				telemetrySource: 'terminal-inline-chat',
			}
		);
		this._reset();
		this._container.appendChild(this._inlineChatWidget.domNode);

		this._focusTracker = this._register(trackFocus(this._container));
	}

	private _reset() {
		this._inlineChatWidget.placeholder = localize('default.placeholder', "Ask how to do something in the terminal");
		this._inlineChatWidget.updateInfo(localize('welcome.1', "AI-generated commands may be incorrect"));
	}

	reveal(): void {
		this._inlineChatWidget.layout(new Dimension(640, 150));
		this._container.classList.remove('hide');
		this._focusedContextKey.set(true);
		this._visibleContextKey.set(true);
		this._inlineChatWidget.focus();
		this.layoutVertically();
		this._updateWidth();
		this._register(this._instance.onDimensionsChanged(() => this._updateWidth()));
	}

	layoutVertically(): void {
		const font = this._instance.xterm?.getFont();
		if (!font?.charHeight) {
			return;
		}
		const cursorY = (this._instance.xterm?.raw.buffer.active.cursorY ?? 0) + 1;
		const height = font.charHeight * font.lineHeight;
		const top = cursorY * height + 12;
		this._container.style.top = `${top}px`;
		const terminalHeight = this._instance.domElement.clientHeight;
		if (terminalHeight && top > terminalHeight - this._inlineChatWidget.getHeight()) {
			this._container.style.top = '';
		}
	}

	private _updateWidth() {
		const terminalWidth = this._instance.domElement.clientWidth;
		if (terminalWidth && terminalWidth < 640) {
			this._inlineChatWidget.layout(new Dimension(terminalWidth - 40, this._inlineChatWidget.getHeight()));
		}
	}

	hide(): void {
		this._container.classList.add('hide');
		this._reset();
		this._inlineChatWidget.updateChatMessage(undefined);
		this._inlineChatWidget.updateFollowUps(undefined);
		this._inlineChatWidget.updateProgress(false);
		this._inlineChatWidget.updateToolbar(false);
		this._focusedContextKey.set(false);
		this._visibleContextKey.set(false);
		this._inlineChatWidget.value = '';
		this._instance.focus();
	}
	focus(): void {
		this._inlineChatWidget.focus();
	}
	focusResponse(): void {
		const responseElement = this._inlineChatWidget.domNode.querySelector(ChatElementSelectors.ResponseEditor) || this._inlineChatWidget.domNode.querySelector(ChatElementSelectors.ResponseMessage);
		if (responseElement instanceof HTMLElement) {
			responseElement.focus();
		}
	}
	hasFocus(): boolean {
		return this._inlineChatWidget.hasFocus();
	}
	input(): string {
		return this._inlineChatWidget.value;
	}
	setValue(value?: string) {
		this._inlineChatWidget.value = value ?? '';
	}
	acceptCommand(shouldExecute: boolean): void {
		// Trim command to remove any whitespace, otherwise this may execute the command
		const value = parseCodeFromBlock(this._inlineChatWidget?.responseContent?.trim());
		if (!value) {
			return;
		}
		this._instance.runCommand(value, shouldExecute);
		this.hide();
	}
	updateProgress(progress?: IChatProgress): void {
		this._inlineChatWidget.updateProgress(progress?.kind === 'content' || progress?.kind === 'markdownContent');
	}
	public get focusTracker(): IFocusTracker {
		return this._focusTracker;
	}
}

function parseCodeFromBlock(block?: string): string | undefined {
	const match = block?.match(/```.*?\n([\s\S]*?)```/);
	return match ? match[1].trim() : undefined;
}

const enum ChatElementSelectors {
	ResponseEditor = '.chatMessageContent textarea',
	ResponseMessage = '.chatMessageContent',
}
