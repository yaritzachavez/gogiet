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
    <div className="mb-8 flex flex-col gap-4 sm:mb-10">
      <span className="inline-flex w-fit rounded-full border border-orange-500/25 bg-orange-500/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.24em] text-orange-300">
        {eyebrow}
      </span>
      <div>
        <h2 className="text-3xl font-black tracking-tight text-[#f5f5f5] sm:text-4xl">
          {title}
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[#b3b3b3] sm:text-lg">
          {description}
        </p>
      </div>
    </div>
  );
}
