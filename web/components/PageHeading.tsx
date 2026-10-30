export default function PageHeading({
  title,
  description,
  aside,
}: {
  title: string;
  description: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      {aside}
    </div>
  );
}
