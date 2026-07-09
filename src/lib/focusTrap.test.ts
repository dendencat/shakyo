import { afterEach, describe, expect, it } from 'vitest'
import { collectFocusable, nextFocusTarget } from './focusTrap'

function setContainer(html: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

describe('focusTrap', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('collectFocusable', () => {
    it('DOM順にフォーカス可能要素を抽出する', () => {
      const container = setContainer(`
        <a href="#">link</a>
        <input type="text" />
        <button>btn</button>
      `)
      const elements = collectFocusable(container)
      expect(elements.map((el) => el.tagName)).toEqual(['A', 'INPUT', 'BUTTON'])
    })

    it('disabled な要素を除外する', () => {
      const container = setContainer(`
        <button>enabled</button>
        <button disabled>disabled</button>
        <input disabled />
      `)
      const elements = collectFocusable(container)
      expect(elements).toHaveLength(1)
      expect(elements[0].textContent).toBe('enabled')
    })

    it('tabindex="-1" の要素を除外する', () => {
      const container = setContainer(`
        <div tabindex="-1">skip</div>
        <div tabindex="0">focusable</div>
      `)
      const elements = collectFocusable(container)
      expect(elements).toHaveLength(1)
      expect(elements[0].textContent).toBe('focusable')
    })

    it('要素が0件の場合は空配列を返す', () => {
      const container = setContainer('<p>text only</p>')
      expect(collectFocusable(container)).toEqual([])
    })
  })

  describe('nextFocusTarget', () => {
    it('Tabで末尾から先頭へ循環する', () => {
      const container = setContainer('<button>a</button><button>b</button><button>c</button>')
      const elements = collectFocusable(container)
      const result = nextFocusTarget(elements, elements[2], false)
      expect(result).toBe(elements[0])
    })

    it('Tabで通常時は次の要素へ進む', () => {
      const container = setContainer('<button>a</button><button>b</button><button>c</button>')
      const elements = collectFocusable(container)
      const result = nextFocusTarget(elements, elements[0], false)
      expect(result).toBe(elements[1])
    })

    it('Shift+Tabで先頭から末尾へ循環する', () => {
      const container = setContainer('<button>a</button><button>b</button><button>c</button>')
      const elements = collectFocusable(container)
      const result = nextFocusTarget(elements, elements[0], true)
      expect(result).toBe(elements[2])
    })

    it('Shift+Tabで通常時は前の要素へ戻る', () => {
      const container = setContainer('<button>a</button><button>b</button><button>c</button>')
      const elements = collectFocusable(container)
      const result = nextFocusTarget(elements, elements[2], true)
      expect(result).toBe(elements[1])
    })

    it('activeがcontainer外の要素の場合はTabで先頭要素を返す', () => {
      const container = setContainer('<button>a</button><button>b</button>')
      const elements = collectFocusable(container)
      const outside = document.createElement('button')
      document.body.appendChild(outside)
      const result = nextFocusTarget(elements, outside, false)
      expect(result).toBe(elements[0])
    })

    it('activeがcontainer外の要素の場合はShift+Tabで末尾要素を返す', () => {
      const container = setContainer('<button>a</button><button>b</button>')
      const elements = collectFocusable(container)
      const outside = document.createElement('button')
      document.body.appendChild(outside)
      const result = nextFocusTarget(elements, outside, true)
      expect(result).toBe(elements[elements.length - 1])
    })

    it('要素が0件の場合はnullを返す', () => {
      expect(nextFocusTarget([], null, false)).toBeNull()
      expect(nextFocusTarget([], null, true)).toBeNull()
    })
  })
})
