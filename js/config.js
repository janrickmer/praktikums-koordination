// ---------------------------------------------------------------------
//  Verbindung zur Datenbank (Supabase)
//
//  Die beiden Werte findest du im Supabase-Dashboard unter
//  "Project Settings" → "API Keys" bzw. "Data API".
//  Sie sind dafür gedacht, öffentlich im Browser verwendet zu werden,
//  und dürfen deshalb im (öffentlichen) Repository stehen.
//  NIEMALS den "secret" bzw. "service_role"-Schlüssel hier eintragen!
// ---------------------------------------------------------------------
export const CONFIG = {
  // Projekt-URL, z. B. 'https://abcdefghijklmnop.supabase.co'
  supabaseUrl: '',
  // "Publishable key" (beginnt mit sb_publishable_) oder der ältere "anon public"-Schlüssel
  supabaseKey: '',
  schoolName: 'Georg-Christoph-Lichtenberg-Schule Kassel',
};
