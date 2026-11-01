import { Icon, type IconName } from './Icon'
import './PaneTitle.css'

export function PaneTitle({ icon, label }: { icon: Extract<IconName, 'editor' | 'reference' | 'aiExplain'>; label: string }) {
  return (
    <h2 className="pane-title" title={label}>
      <Icon name={icon} />
      <span className="pane-title-sr-only">{label}</span>
    </h2>
  )
}
