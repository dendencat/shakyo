import { EditorState, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentOnInput, indentService, indentUnit } from '@codemirror/language'
import { insertNewline } from '@codemirror/commands'
import { vim, getCM } from '@replit/codemirror-vim'
import { emacs } from '@replit/codemirror-emacs'
import { vscodeKeymap } from '@replit/codemirror-vscode-keymap'
import type { EditorMode } from './preferences'

export interface EditorPreferences {
  editorMode: EditorMode
  indentStyle: 'spaces' | 'tabs'
  indentWidth: 2 | 4 | 8
  autoIndent: boolean
  fontSize: number
}

export function editorPreferenceExtensions(settings: EditorPreferences): Extension[] {
  return [
    indentUnit.of(settings.indentStyle === 'tabs' ? '\t' : ' '.repeat(settings.indentWidth)),
    EditorState.tabSize.of(settings.indentWidth),
    EditorView.theme({ '&': { fontSize: `${settings.fontSize}px` } }),
    settings.autoIndent ? indentOnInput() : [
      Prec.highest(indentService.of(() => 0)),
      Prec.highest(keymap.of([{
        key: 'Enter',
        run: (view) => {
          if (settings.editorMode === 'vim' && !getCM(view)?.state.vim?.insertMode) return false
          return insertNewline(view)
        },
      }])),
    ],
    settings.editorMode === 'vim' ? Prec.high(vim()) :
      settings.editorMode === 'emacs' ? Prec.high(emacs()) :
        settings.editorMode === 'vscode' ? Prec.high(keymap.of(vscodeKeymap)) : [],
  ]
}
