export function activate(ctx) {
  ctx.commands.register('example.network-data.fetch', async () => {
    const response = await ctx.network.fetch({ url: 'https://jsonplaceholder.typicode.com/posts/1' })
    if (response.status !== 200) throw new Error('取得できませんでした。')
    await ctx.ui.notify(String(JSON.parse(response.body).title))
  })
}
