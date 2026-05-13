type HomeSectionHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function HomeSectionHeader({
  eyebrow,
  title,
  description,
}: HomeSectionHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:mb-10">
      <span className="inline-flex w-fit rounded-full border border-orange-100 bg-orange-50 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em] text-orange-700">
        {eyebrow}
      </span>
      <div>
        <h2 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          {title}
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
          {description}
        </p>
      </div>
    </div>
  );
}
