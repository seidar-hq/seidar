import styles from "./workspace-page.module.css";

export default function WorkspacePage({
  title,
  description,
  action,
  hideHeader = false,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  hideHeader?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className={styles.page}>
      {!hideHeader && (
        <header>
          <div>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {action}
        </header>
      )}
      {children ?? (
        <div className={styles.empty}>
          <span>Nothing here yet</span>
          <p>This project does not have any {title.toLowerCase()} yet.</p>
        </div>
      )}
    </section>
  );
}
