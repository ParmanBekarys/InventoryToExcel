import { MapPin, Tag } from 'lucide-react';
import { ListManager } from '../components/ListManager';
import type { Navigate } from '../hooks/useHashRoute';

export function CategoriesPage({ navigate }: { navigate: Navigate }) {
  return (
    <ListManager
      list="categories"
      icon={Tag}
      title="Categories"
      subtitle="The list from the Categories worksheet. Used for the CATEGORY column."
      placeholder="New category, e.g. Safety Equipment"
      onShowItems={(name) => navigate(`/inventory?category=${encodeURIComponent(name)}`)}
    />
  );
}

export function LocationsPage({ navigate }: { navigate: Navigate }) {
  return (
    <ListManager
      list="locations"
      icon={MapPin}
      title="Locations"
      subtitle="The list from the Locations worksheet. Tip: use “Building - Floor - Room”, e.g. Building A - Floor 1 - Room 101."
      placeholder="Building A - Floor 1 - Room 101"
      onShowItems={(name) => navigate(`/inventory?location=${encodeURIComponent(name)}`)}
    />
  );
}
