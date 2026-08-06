import type { FormEvent } from "react";
import type { AddonSortIndex } from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Col,
  Form,
  ListGroup,
  Row,
  Spinner,
  Stack,
} from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { formatCount } from "../../utils";
import { ADDON_SORT_OPTIONS } from "../addon-panel/sortOptions";
import type { ModpackHit, ModpackSource } from "./normalizeHit";

interface Props {
  source: ModpackSource;
  query: string;
  sort: AddonSortIndex;
  category: string;
  categories: Array<{ name: string; label: string }>;
  hits: ModpackHit[];
  totalHits: number;
  searching: boolean;
  configured: boolean;
  canLoadMore: boolean;
  installing: string | null;
  canUpdate: boolean;
  onSourceChange: (value: ModpackSource) => void;
  onQueryChange: (value: string) => void;
  onSortChange: (value: AddonSortIndex) => void;
  onCategoryChange: (value: string) => void;
  onSearch: (e: FormEvent) => void;
  onSelectHit: (projectId: string) => void;
  onInstallHit: (hit: ModpackHit) => void;
  onLoadMore: () => void;
}

export function ModpackSearch({
  source,
  query,
  sort,
  category,
  categories,
  hits,
  totalHits,
  searching,
  configured,
  canLoadMore,
  installing,
  canUpdate,
  onSourceChange,
  onQueryChange,
  onSortChange,
  onCategoryChange,
  onSearch,
  onSelectHit,
  onInstallHit,
  onLoadMore,
}: Props) {
  const { t } = useI18n();

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="h6 mb-0">
          <i className="fa-solid fa-cubes me-2" />
          {t("modpacks.browse")}
        </h3>
        <span className="small text-secondary">
          {t("addons.results", { count: totalHits.toLocaleString() })}
        </span>
      </div>

      <Form onSubmit={onSearch} className="mb-3">
        <Row className="g-2">
          <Col md={3}>
            <Form.Select
              size="sm"
              value={source}
              onChange={(e) => onSourceChange(e.target.value as ModpackSource)}
              aria-label={t("modpacks.source")}
            >
              <option value="modrinth">Modrinth</option>
              <option value="curseforge">CurseForge</option>
            </Form.Select>
          </Col>
          <Col md={source === "modrinth" ? 4 : 6}>
            <Form.Control
              size="sm"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t("modpacks.search")}
            />
          </Col>
          {source === "modrinth" && (
            <Col md={3}>
              <Form.Select
                size="sm"
                value={sort}
                onChange={(e) => onSortChange(e.target.value as AddonSortIndex)}
                aria-label={t("addons.sortBy")}
              >
                {ADDON_SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </Form.Select>
            </Col>
          )}
          <Col md="auto">
            <Button size="sm" variant="primary" type="submit" disabled={searching}>
              {searching ? <Spinner size="sm" /> : t("common.search")}
            </Button>
          </Col>
        </Row>
      </Form>

      {source === "curseforge" && !configured && (
        <Alert variant="warning">{t("modpacks.curseforgeMissing")}</Alert>
      )}

      {source === "modrinth" && (
        <Stack direction="horizontal" gap={2} className="flex-wrap mb-3">
          <Button
            size="sm"
            variant={category === "" ? "primary" : "outline-secondary"}
            onClick={() => onCategoryChange("")}
          >
            {t("common.all")}
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.name}
              size="sm"
              variant={category === cat.name ? "primary" : "outline-secondary"}
              onClick={() => onCategoryChange(cat.name)}
            >
              {cat.label}
            </Button>
          ))}
        </Stack>
      )}

      {searching && hits.length === 0 && (
        <Alert variant="light" className="border small py-2 mb-3">
          <Spinner size="sm" className="me-2" />
          {t("modpacks.searchingLibrary")}
        </Alert>
      )}

      <ListGroup className="mb-3">
        {hits.length === 0 && !searching && (
          <ListGroup.Item className="text-secondary">
            {t("modpacks.noResults")}
          </ListGroup.Item>
        )}
        {hits.map((h) => {
          const clickable = source === "modrinth" && Boolean(h.projectId);
          return (
            <ListGroup.Item
              key={h.key}
              className={`d-flex justify-content-between align-items-start gap-3 flex-wrap${
                clickable ? " addon-row-clickable" : ""
              }`}
              onClick={
                clickable
                  ? () => onSelectHit(h.projectId!)
                  : undefined
              }
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectHit(h.projectId!);
                      }
                    }
                  : undefined
              }
            >
              <div className="d-flex gap-2 min-w-0">
                {h.iconUrl ? (
                  <img
                    className="addon-icon"
                    src={h.iconUrl}
                    alt=""
                    width={40}
                    height={40}
                  />
                ) : (
                  <div className="addon-icon addon-icon-fallback d-grid place-items-center">
                    <i className="fa-solid fa-cubes text-secondary" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="fw-semibold">{h.title}</div>
                  <div className="small text-secondary">
                    {h.author
                      ? `${t("addons.byAuthor", { author: h.author })} · `
                      : ""}
                    {t("addons.downloadsCount", {
                      count: formatCount(h.downloads),
                    })}
                    {h.follows > 0
                      ? ` · ${t("addons.likesCount", {
                          count: formatCount(h.follows),
                        })}`
                      : ""}
                  </div>
                  {h.categories.length > 0 && (
                    <Stack
                      direction="horizontal"
                      gap={1}
                      className="flex-wrap mt-1"
                    >
                      {h.categories.slice(0, 4).map((c) => (
                        <Badge
                          key={c}
                          bg="secondary"
                          className={
                            source === "modrinth" ? "cursor-pointer" : undefined
                          }
                          onClick={
                            source === "modrinth"
                              ? (e) => {
                                  e.stopPropagation();
                                  onCategoryChange(c);
                                }
                              : undefined
                          }
                        >
                          {c}
                        </Badge>
                      ))}
                    </Stack>
                  )}
                  <p className="small text-secondary mb-0 mt-1">{h.description}</p>
                </div>
              </div>
              {canUpdate && (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!!installing}
                  onClick={(e) => {
                    e.stopPropagation();
                    onInstallHit(h);
                  }}
                >
                  {installing === (h.projectId ?? h.key) ? (
                    <Spinner size="sm" />
                  ) : (
                    t("modpacks.install")
                  )}
                </Button>
              )}
            </ListGroup.Item>
          );
        })}
      </ListGroup>

      {canLoadMore && (
        <div className="text-center">
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={searching}
            onClick={() => onLoadMore()}
          >
            {searching ? t("common.loading") : t("addons.loadMore")}
          </Button>
        </div>
      )}
    </>
  );
}
