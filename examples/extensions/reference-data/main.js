export function activate(ctx) {
  ctx.commands.register('example.reference-data.open', async () => {
    const text = await ctx.assets.readText('sample.txt')
    await ctx.reference.openText({ name: '拡張からのお手本', text, language: 'ts' })
  })
}
