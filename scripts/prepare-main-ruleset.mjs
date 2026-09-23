// Read the existing GitHub ruleset JSON on stdin; write a reviewable PUT body on stdout.
let input = ''
for await (const chunk of process.stdin) input += chunk
const current = JSON.parse(input)
const includes = current.conditions?.ref_name?.include ?? []
if (current.target !== 'branch' || !includes.some(ref => ref === 'refs/heads/main' || ref === '~DEFAULT_BRANCH')) {
  throw new Error('Expected the existing main branch ruleset')
}
const rules = current.rules.map(rule => ({ type: rule.type, ...(rule.parameters && { parameters: rule.parameters }) }))
const review = rules.find(rule => rule.type === 'pull_request')
if (!review) throw new Error('Existing main ruleset has no pull request rule')
review.parameters = { ...review.parameters, required_review_thread_resolution: true }
const status = rules.find(rule => rule.type === 'required_status_checks')
const required_status_checks = ['web', 'rust', 'browser', 'dependency-review'].map(context => ({ context }))
if (status) {
  status.parameters = { ...status.parameters, strict_required_status_checks_policy: true, required_status_checks }
} else {
  rules.push({ type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_status_checks } })
}
const body = {
  name: current.name,
  target: current.target,
  enforcement: current.enforcement,
  bypass_actors: (current.bypass_actors ?? []).filter(actor =>
    actor.actor_type !== 'RepositoryRole' || actor.actor_id === 5),
  conditions: current.conditions,
  rules,
}
process.stdout.write(JSON.stringify(body, null, 2) + '\n')
