// Gancho con destello del logo de Clóset Digital. Hereda el color con
// `text-*` (currentColor). Siempre va acompañado del nombre en texto HTML,
// nunca con el nombre dentro de la imagen. Versión favicon: app/icon.svg.
export function Isotipo({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <g transform="translate(0 2)">
        <path d="M9.9 6.3a2.2 2.2 0 1 1 3.6 1.7c-.9.6-1.5 1.1-1.5 2.1" />
        <path d="M12 10.1 3.4 15.6a.9.9 0 0 0 .5 1.7h16.2a.9.9 0 0 0 .5-1.7Z" />
        <path
          fill="currentColor"
          stroke="none"
          d="M17.6 2.4c.2 1.1.6 1.5 1.7 1.7-1.1.2-1.5.6-1.7 1.7-.2-1.1-.6-1.5-1.7-1.7 1.1-.2 1.5-.6 1.7-1.7Z"
        />
        <path
          fill="currentColor"
          stroke="none"
          d="M20.3 5.9c.1.6.3.8.9.9-.6.1-.8.3-.9.9-.1-.6-.3-.8-.9-.9.6-.1.8-.3.9-.9Z"
        />
      </g>
    </svg>
  )
}
