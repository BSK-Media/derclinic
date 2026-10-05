"use client";

import * as React from "react";
import { User as UserIcon } from "lucide-react";

// Zdjęcie specjalisty doładowywane osobnym żądaniem (patrz
// /api/patient/specialists/[id]/avatar), żeby wielomegabajtowy obraz nie
// wstrzymywał otwarcia strony. Gdy specjalista nie ma zdjęcia, zostaje ikona.
export function SpecialistAvatar({
  specialistId,
  name,
  iconClassName,
}: {
  specialistId: string;
  name: string;
  iconClassName: string;
}) {
  const [failed, setFailed] = React.useState(false);

  return (
    <>
      <span className="absolute inset-0 flex items-center justify-center text-zinc-400">
        <UserIcon className={iconClassName} />
      </span>
      {failed ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/patient/specialists/${specialistId}/avatar`}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full bg-zinc-100 object-cover"
        />
      )}
    </>
  );
}
