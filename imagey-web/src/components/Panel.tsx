export default function Panel({
  className,
  title,
  image,
  actions,
  children,
}: {
  className?: string;
  title: string;
  image: React.ReactNode | string;
  actions?: React.ReactNode | React.ReactNode[];
  children?: React.ReactNode | React.ReactNode[];
}) {
  return (
    <div className={className}>
      <article
        className="no-padding border"
        style={{ display: "flex", flexDirection: "column", height: "100%" }}
      >
        {typeof image === "string" ? (
          <img
            className="responsive small"
            src={image}
            style={{ objectFit: "cover" }}
          />
        ) : (
          image
        )}
        <div
          className="padding"
          style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}
        >
          <h5 className="max truncate center-align">{title}</h5>
          {children}
          {actions && (
            <nav className="center-align" style={{ marginTop: "auto" }}>
              {actions}
            </nav>
          )}
        </div>
      </article>
    </div>
  );
}
