import { Monitor, Moon, Sun } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Form'
import { useTheme, type ThemePreference } from '@/hooks/useTheme'

const ORDER: ThemePreference[] = ['system', 'light', 'dark']
const LABEL: Record<ThemePreference, string> = { system: 'Match device', light: 'Light', dark: 'Dark' }

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme()
  if (compact) {
    const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length]!
    const Icon = preference === 'dark' ? Moon : preference === 'light' ? Sun : Monitor
    return (
      <IconButton label={`Theme: ${LABEL[preference]}. Switch to ${LABEL[next]}`} onClick={() => setPreference(next)} size="sm">
        <Icon className="size-[18px]" />
      </IconButton>
    )
  }
  return (
    <Segmented
      label="Theme"
      value={preference}
      onChange={setPreference}
      options={[
        { value: 'system', label: <><Monitor className="size-4" /> Auto</> },
        { value: 'light', label: <><Sun className="size-4" /> Light</> },
        { value: 'dark', label: <><Moon className="size-4" /> Dark</> },
      ]}
    />
  )
}
