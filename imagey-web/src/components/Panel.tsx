import React from "react";
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
        className="no-padding border vertical"
        style={{ height: "100%" }}
      >
        {typeof image === "string" ? (
          <img className="responsive small" src={image} />
        ) : (
          image
        )}
        <div className="padding vertical" style={{ flexGrow: 1 }}>
          <h5 className="max truncate center-align">{title}</h5>
          {children}
          {actions && (
            <nav className="center-align auto-margin top-margin">{actions}</nav>
          )}
        </div>
      </article>
    </div>
  );
}
