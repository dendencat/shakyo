export function activate(ctx) {
  ctx.subscriptions.push(ctx.commands.register('example.text-tools.uppercase', async () => {
    const snapshot = await ctx.editor.getSnapshot()
    if (await ctx.settings.get('confirm') && !await ctx.ui.confirm('選択範囲（未選択なら全文）を大文字にしますか？')) return
    const from = snapshot.selection.from
    const to = snapshot.selection.to
    const start = from === to ? 0 : from
    const end = from === to ? snapshot.text.length : to
    await ctx.editor.applyEdits({ expectedRevision: snapshot.revision, edits: [{ from: start, to: end, insert: snapshot.text.slice(start, end).toUpperCase() }] })
  }))
}
