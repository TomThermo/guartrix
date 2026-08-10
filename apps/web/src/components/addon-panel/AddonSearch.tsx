import type { FormEvent } from "react";
import type { AddonCategory, AddonSearchHit, AddonSortIndex } from "@guartrix/shared";
import { Alert, Badge, Button, Col, Form, ListGroup, Row, Spinner, Stack } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { formatCount } from "../../utils";
import { ADDON_SORT_OPTIONS } from "./sortOptions";

interface Props {
  query: string;
  category: string;
  sort: AddonSortIndex;
  categories: AddonCategory[];
  hits: AddonSearchHit[];
  totalHits: number;
  searching: boolean;
  canLoadMore: boolean;
  installedIds: Set<string>;
  busyId: string | null;
  canUpdate: boolean;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSortChange: (value: AddonSortIndex) => void;
  onSearch: (e: FormEvent) => void;
  onSelectHit: (projectId: string) => void;
  onInstallHit: (hit: AddonSearchHit) => void;
  onLoadMore: () => void;
}

export function AddonSearch({
  query,
  category,
  sort,
  categories,
  hits,
  totalHits,
  searching,
  canLoadMore,
  installedIds,
  busyId,
  canUpdate,
  onQueryChange,
  onCategoryChange,
  onSortChange,
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
          <i className="fa-solid fa-puzzle-piece me-2" />
          {t("addons.browseModrinth")}
        </h3>
        <span className="small text-secondary">
          {t("addons.results", { count: totalHits.toLocaleString() })}
        </span>
      </div>

      <Form onSubmit={onSearch} className="mb-3">
        <Row className="g-2">
          <Col md={6}>
            <Form.Control
              size="sm"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t("addons.search")}
            />
          </Col>
          <Col md={4}>
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
          <Col md="auto">
            <Button size="sm" variant="primary" type="submit" disabled={searching}>
              {searching ? <Spinner size="sm" /> : t("common.search")}
            </Button>
          </Col>
        </Row>
      </Form>

      {searching && (
        <Alert variant="light" className="border small py-2 mb-3">
          <Spinner size="sm" className="me-2" />
          {t("addons.searchingLibrary")}
        </Alert>
      )}

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

      <ListGroup className="mb-3">
        {hits.length === 0 && !searching && (
          <ListGroup.Item className="text-secondary">{t("addons.empty")}</ListGroup.Item>
        )}
        {hits.map((h) => (
          <ListGroup.Item
            key={h.projectId}
            className="d-flex justify-content-between align-items-start gap-3 flex-wrap addon-row-clickable"
            onClick={() => onSelectHit(h.projectId)}
          >
            <div className="d-flex gap-2 min-w-0">
              {h.iconUrl ? (
                <img className="addon-icon" src={h.iconUrl} alt="" width={40} height={40} />
              ) : (
                <div className="addon-icon addon-icon-fallback d-grid place-items-center">
                  <i className="fa-solid fa-puzzle-piece text-secondary" />
                </div>
              )}
              <div className="min-w-0">
                <div className="fw-semibold">{h.title}</div>
                <div className="small text-secondary">
                  {t("addons.byAuthor", { author: h.author })} ·{" "}
                  {t("addons.downloadsCount", {
                    count: formatCount(h.downloads),
                  })}{" "}
                  · {t("addons.likesCount", { count: formatCount(h.follows) })}
                </div>
                {h.categories.length > 0 && (
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {h.categories.slice(0, 4).map((c) => (
                      <Badge
                        key={c}
                        bg="secondary"
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCategoryChange(c);
                        }}
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="small text-secondary mb-0 mt-1">{h.description}</p>
              </div>
            </div>
            {canUpdate && (
              <Button
                size="sm"
                variant="primary"
                disabled={busyId === h.projectId || installedIds.has(h.projectId)}
                onClick={(e) => {
                  e.stopPropagation();
                  onInstallHit(h);
                }}
              >
                {installedIds.has(h.projectId)
                  ? t("addons.installed")
                  : busyId === h.projectId
                    ? t("common.creating")
                    : t("addons.install")}
              </Button>
            )}
          </ListGroup.Item>
        ))}
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
