import { ImageOff, Package } from 'lucide-react';
import type { InventoryItem } from '../types/inventory';
import { cx } from '../utils/format';

export function ItemPhoto({ item, className, iconClass = 'size-5' }: { item: Pick<InventoryItem, 'photo' | 'name' | 'photoText'>; className?: string; iconClass?: string }) {
  if (item.photo?.url) {
    return <img src={item.photo.url} alt={item.name} className={cx('object-cover', className)} loading="lazy" draggable={false} />;
  }
  const Icon = item.photoText ? ImageOff : Package;
  return (
    <div className={cx('flex items-center justify-center bg-slate-100 text-slate-400', className)} title={item.photoText ? `PHOTO cell text: ${item.photoText}` : 'No photo'}>
      <Icon className={iconClass} />
    </div>
  );
}
