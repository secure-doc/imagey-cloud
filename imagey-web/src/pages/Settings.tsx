import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

export default function Settings() {
  return (
    <main>
      <SettingsList />
    </main>
  );
}

export function SettingsList({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <section
      className={
        className ? className + " col scroll s12 m6 l6" : "col scroll s12 m6 l6"
      }
    >
      <ul className="list border">
        <li className="ripple" onClick={() => navigate("devices")}>
          <i>devices</i>
          <div className="max">
            <h6 className="small">{t("Devices")}</h6>
          </div>
        </li>
      </ul>
    </section>
  );
}
