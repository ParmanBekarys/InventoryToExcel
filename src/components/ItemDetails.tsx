import { Maximize2, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PhotoViewer } from './PhotoViewer';
import type { ReactNode } from 'react';
import type { InventoryItem } from '../types/inventory';
import { prettyStamp } from '../utils/dates';
import { formatNumber } from '../utils/format';
import { ItemPhoto } from './ItemPhoto';
import { Modal } from './Modal';
import { Badge, Button } from './ui';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

export function ItemDetails({ item, onClose, onEdit, onDelete }: { item: InventoryItem | null; onClose: () => void; onEdit: (i: InventoryItem) => void; onDelete: (i: InventoryItem) => void }) {
  const [zoom, setZoom] = useState(false);
  return (
    <>
    <Modal
      open={!!item}
      onClose={onClose}
      title={item ? `${item.id || 'No ID'} · ${item.name}` : ''}
      size="lg"
      footer={
        item && (
          <>
            <Button icon={Trash2} variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700 sm:mr-auto" onClick={() => onDelete(item)}>
              Delete
            </Button>
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" icon={Pencil} onClick={() => onEdit(item)}>
              Edit item
            </Button>
          </>
        )
      }
    >
      {item && (
        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {item.photo ? (
            <button type="button" onClick={() => setZoom(true)} className="group relative block cursor-zoom-in overflow-hidden rounded-xl border border-line bg-slate-50" aria-label="View photo full screen">
              <ItemPhoto item={item} className="aspect-square w-full !object-contain" iconClass="size-10" />
              <span className="absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-900/70 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <Maximize2 className="size-3.5" /> Full screen
              </span>
            </button>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-slate-50">
              <ItemPhoto item={item} className="aspect-square w-full !object-contain" iconClass="size-10" />
            </div>
          )}
          <dl className="divide-y divide-line">
            <Row label="ID">
              <span className="font-mono text-[13px] font-medium">{item.id}</span>
            </Row>
            <Row label="Name">{item.name}</Row>
            <Row label="Category">{item.category && <Badge tone="blue">{item.category}</Badge>}</Row>
            <Row label="Quantity">
              <span className="font-semibold tabular-nums">{formatNumber(item.quantity)}</span>
            </Row>
            <Row label="Location">{item.location}</Row>
            <Row label="Description">
              <span className="whitespace-pre-wrap">{item.description}</span>
            </Row>
            <Row label="Added by">{item.addedBy}</Row>
            <Row label="Created">{prettyStamp(item.createdDate)}</Row>
            <Row label="Updated">{prettyStamp(item.updatedDate)}</Row>
            {!item.photo && item.photoText && <Row label="Photo cell">{item.photoText}</Row>}
            {Object.entries(item.extra).map(([k, v]) => (
              <Row key={k} label={k}>
                {String(v)}
              </Row>
            ))}
          </dl>
        </div>
      )}
    </Modal>
    <PhotoViewer src={zoom && item?.photo ? item.photo.url : null} alt={item?.name ?? ''} caption={item ? `${item.id} · ${item.name}` : ''} onClose={() => setZoom(false)} />
    </>
  );
}
