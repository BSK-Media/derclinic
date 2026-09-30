// Pola pacjenta, które wolno zwracać do przeglądarki personelu. Nigdy nie
// dołączamy passwordHash ani passwordResetTokenHash — `include: { patient: true }`
// zwracał je dotąd każdemu pracownikowi (także specjaliście) razem z wizytą.
export const PATIENT_PUBLIC_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  name: true,
  phone: true,
  email: true,
  note: true,
  loyaltyPoints: true,
  locationId: true,
} as const;
