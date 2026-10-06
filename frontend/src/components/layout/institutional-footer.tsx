import styles from './institutional-footer.module.css';

const DEVELOPER_URL = 'https://lukyanaraujo.com';
const MARK_SRC = '/brand/lukyan-araujo-mark.png';

type InstitutionalFooterProps = {
  readonly placement?: 'app' | 'login';
};

export function InstitutionalFooter({ placement = 'app' }: InstitutionalFooterProps) {
  return (
    <footer
      className={placement === 'login' ? `${styles.footer} ${styles.login}` : styles.footer}
      data-institutional-footer={placement}
    >
      <p className={styles.line}>
        <span>© 2026 Economização · Todos os direitos reservados</span>
        <span className={styles.sep} aria-hidden="true">
          ·
        </span>
        <span className={styles.credit}>
          Desenvolvido por
          <a
            className={styles.creditLink}
            href={DEVELOPER_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Lukyan Araújo"
          >
            <img className={styles.mark} src={MARK_SRC} alt="" width={16} height={16} />
          </a>
        </span>
      </p>
    </footer>
  );
}
