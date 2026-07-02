/** Row shape returned directly from the database (snake_case). */
export interface PaymentRow {
  id:             string;
  tournament_id:  string;
  team_id:        string;
  amount:         string;
  currency:       string;
  payment_method: string | null;
  reference:      string | null;
  notes:          string | null;
  status:         string;
  recorded_by:    string | null;
  paid_at:        Date | null;
  created_at:     Date;
}

/** Domain object (camelCase). */
export interface Payment {
  id:            string;
  tournamentId:  string;
  teamId:        string;
  amount:        string;
  currency:      string;
  paymentMethod: string | null;
  reference:     string | null;
  notes:         string | null;
  status:        string;
  recordedBy:    string | null;
  paidAt:        string | null;
  createdAt:     string;
}

/** Maps a DB row to the domain Payment object. */
export function mapPaymentRow(row: PaymentRow): Payment {
  return {
    id:            row.id,
    tournamentId:  row.tournament_id,
    teamId:        row.team_id,
    amount:        row.amount,
    currency:      row.currency,
    paymentMethod: row.payment_method,
    reference:     row.reference,
    notes:         row.notes,
    status:        row.status,
    recordedBy:    row.recorded_by,
    paidAt:        row.paid_at ? row.paid_at.toISOString() : null,
    createdAt:     row.created_at.toISOString(),
  };
}

export interface CreatePaymentInput {
  tournamentId:  string;
  teamId:        string;
  amount:        number | string;
  currency:      string;
  paymentMethod: string | null;
  reference:     string | null;
  notes:         string | null;
  status:        string;
  recordedBy:    string | null;
  paidAt:        string | null;
}

export interface UpdatePaymentInput {
  amount?:        number | string;
  currency?:      string;
  paymentMethod?: string | null;
  reference?:     string | null;
  notes?:         string | null;
  status?:        string;
  paidAt?:        string | null;
}
