import { ImagePlus, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { uploadMedia } from '@/services/restaurants'
import { Button } from './Button'
import { Photo } from './Display'

/** Upload to the restaurant's media bucket (managers only, enforced by storage RLS) or paste a URL. */
export function ImageField({
  label,
  value,
  onChange,
  restaurantId,
  folder,
  aspect = 'aspect-[16/9]',
  accept = 'image/png,image/jpeg,image/webp,image/avif',
  kind = 'image',
}: {
  label: string
  value: string | null
  onChange: (url: string | null) => void
  restaurantId: string
  folder: string
  aspect?: string
  accept?: string
  kind?: 'image' | 'pdf'
}) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const toast = useToast()

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error('That file is too large', 'Use a file under 10 MB.')
      return
    }
    setUploading(true)
    try {
      onChange(await uploadMedia(restaurantId, file, folder))
    } catch (err) {
      toast.error('Upload failed', errorMessage(err))
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      <div className="mt-1.5 flex items-start gap-3">
        {kind === 'image' ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={cn('group relative w-40 shrink-0 overflow-hidden rounded-lg border border-dashed border-line-strong bg-surface-2', aspect)}
            aria-label={value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          >
            {value ? <Photo src={value} alt="" className="absolute inset-0" /> : <ImagePlus className="absolute inset-0 m-auto size-6 text-ink-3" />}
          </button>
        ) : (
          value && (
            <a href={value} target="_blank" rel="noreferrer" className="text-sm font-semibold break-all text-clay">
              View current PDF
            </a>
          )
        )}
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="sm" loading={uploading} onClick={() => input.current?.click()} icon={<Upload className="size-4" />}>
            {value ? 'Replace' : 'Upload'}
          </Button>
          {value && (
            <Button variant="quiet" size="sm" onClick={() => onChange(null)} icon={<Trash2 className="size-4" />}>Remove</Button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept={kind === 'pdf' ? 'application/pdf' : accept} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
    </div>
  )
}
