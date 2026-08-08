import { Dropdown, Nav } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { CATEGORIES, type CategoryId } from "./settings-fields";

export function SettingsCategoryNav({
  category,
  onCategoryChange,
}: {
  category: CategoryId;
  onCategoryChange: (id: CategoryId) => void;
}) {
  const { t } = useI18n();
  const activeCategory = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
  const settingsLabel = (id: CategoryId) => t(`settings.${id}`);

  return (
    <div className="settings-nav-wrap">
      <div className="d-sm-none mb-1">
        <Dropdown className="card-section-menu">
          <Dropdown.Toggle
            variant="outline-secondary"
            className="w-100 d-flex align-items-center justify-content-between"
            id="settings-section-menu"
          >
            <span className="d-flex align-items-center gap-2 min-w-0">
              <i className="fa-solid fa-bars" aria-hidden />
              <i className={`fa-solid ${activeCategory.icon}`} aria-hidden />
              <span className="text-truncate">{settingsLabel(activeCategory.id)}</span>
            </span>
          </Dropdown.Toggle>
          <Dropdown.Menu className="w-100">
            {CATEGORIES.map((c) => (
              <Dropdown.Item
                key={c.id}
                active={category === c.id}
                onClick={() => onCategoryChange(c.id)}
                title={t(c.hintKey)}
              >
                <i className={`fa-solid ${c.icon} me-2`} aria-hidden />
                {settingsLabel(c.id)}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
      </div>
      <Nav variant="pills" className="settings-nav gap-1 d-none d-sm-flex flex-column">
        {CATEGORIES.map((c) => (
          <Nav.Link
            key={c.id}
            active={category === c.id}
            onClick={() => onCategoryChange(c.id)}
            className="text-start"
            title={t(c.hintKey)}
          >
            <i className={`fa-solid ${c.icon} me-2`} aria-hidden />
            {settingsLabel(c.id)}
          </Nav.Link>
        ))}
      </Nav>
    </div>
  );
}
