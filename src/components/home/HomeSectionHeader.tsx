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
    <div className="mb-6 flex flex-col gap-3 sm:mb-10 sm:gap-4">
      <span className="inline-flex w-fit rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-orange-300 sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.24em]">
        {eyebrow}
      </span>
      <div>
        <h2 className="text-2xl font-black tracking-tight text-[#f5f5f5] sm:text-4xl">
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#b3b3b3] sm:mt-3 sm:text-lg sm:leading-7">
          {description}
        </p>
      </div>
    </div>
  );
}
