export function PageHeader({ eyebrow, title, description }: { readonly eyebrow: string; readonly title: string; readonly description?: string }) {
  return <div className="mb-8"><p className="eyebrow">{eyebrow}</p><h1 className="mt-3 text-3xl font-light tracking-[-.04em] md:text-5xl">{title}</h1>{description && <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p>}</div>;
}
