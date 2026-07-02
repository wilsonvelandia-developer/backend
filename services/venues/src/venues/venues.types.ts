/** Row shape returned directly from the database (snake_case). */
export interface VenueRow {
  id:            string;
  tournament_id: string | null;
  name:          string;
  address:       string | null;
  city:          string | null;
  location_url:  string | null;
  map_url:       string | null;
  capacity:      number | null;
  surface_type:  string | null;
  image_url:     string | null;
  phone:         string | null;
  email:         string | null;
  description:   string | null;
  is_active:     boolean;
  status:        string;
  created_at:    Date;
  updated_at:    Date;
}

/** Domain object (camelCase). */
export interface Venue {
  id:           string;
  tournamentId: string | null;
  name:         string;
  address:      string | null;
  city:         string | null;
  locationUrl:  string | null;
  mapUrl:       string | null;
  capacity:     number | null;
  surfaceType:  string | null;
  imageUrl:     string | null;
  phone:        string | null;
  email:        string | null;
  description:  string | null;
  isActive:     boolean;
  status:       string;
  createdAt:    string;
  updatedAt:    string;
}

/** Maps a DB row to the domain Venue object. */
export function mapVenueRow(row: VenueRow): Venue {
  return {
    id:           row.id,
    tournamentId: row.tournament_id,
    name:         row.name,
    address:      row.address,
    city:         row.city,
    locationUrl:  row.location_url,
    mapUrl:       row.map_url,
    capacity:     row.capacity,
    surfaceType:  row.surface_type,
    imageUrl:     row.image_url,
    phone:        row.phone,
    email:        row.email,
    description:  row.description,
    isActive:     row.is_active,
    status:       row.status ?? (row.is_active ? 'active' : 'inactive'),
    createdAt:    row.created_at.toISOString(),
    updatedAt:    row.updated_at?.toISOString() ?? row.created_at.toISOString(),
  };
}

export interface CreateVenueInput {
  tournamentId: string | null;
  name:         string;
  address:      string | null;
  city:         string | null;
  locationUrl:  string | null;
  mapUrl:       string | null;
  capacity:     number | null;
  surfaceType:  string | null;
  imageUrl:     string | null;
  phone:        string | null;
  email:        string | null;
  description:  string | null;
}

export interface UpdateVenueInput {
  name?:        string;
  address?:     string | null;
  city?:        string | null;
  locationUrl?: string | null;
  mapUrl?:      string | null;
  capacity?:    number | null;
  surfaceType?: string | null;
  imageUrl?:    string | null;
  phone?:       string | null;
  email?:       string | null;
  description?: string | null;
  isActive?:    boolean;
  status?:      string;
}
