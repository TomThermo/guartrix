import type { AddonProjectDetails } from "@guartrix/shared";
import { Col, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

interface Props {
  project: AddonProjectDetails;
  galleryIndex: number;
  onGalleryIndexChange: (index: number) => void;
}

export function AddonDetailGallery({ project, galleryIndex, onGalleryIndexChange }: Props) {
  const { t } = useI18n();

  return (
    <div className="addon-gallery">
      {project.gallery.length === 0 ? (
        <div className="text-secondary small p-3">{t("addons.noGallery")}</div>
      ) : (
        <>
          <div className="addon-gallery-slide">
            <img
              src={project.gallery[galleryIndex]?.url}
              alt={project.gallery[galleryIndex]?.title || project.title}
            />
          </div>
          {(project.gallery[galleryIndex]?.title || project.gallery[galleryIndex]?.description) && (
            <div className="addon-gallery-caption px-3 py-2">
              {project.gallery[galleryIndex]?.title && (
                <div className="fw-semibold small">{project.gallery[galleryIndex]?.title}</div>
              )}
              {project.gallery[galleryIndex]?.description && (
                <div className="small text-secondary">
                  {project.gallery[galleryIndex]?.description}
                </div>
              )}
            </div>
          )}
          <div className="addon-gallery-thumbs p-2">
            <Row className="g-2">
              {project.gallery.map((img, i) => (
                <Col key={img.url} xs={4} sm={3} md={2}>
                  <button
                    type="button"
                    className={`addon-gallery-thumb${i === galleryIndex ? " is-active" : ""}`}
                    onClick={() => onGalleryIndexChange(i)}
                    aria-label={img.title || `Image ${i + 1}`}
                  >
                    <img src={img.url} alt="" />
                  </button>
                </Col>
              ))}
            </Row>
            <div className="small text-secondary text-center mt-2">
              {galleryIndex + 1} / {project.gallery.length}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
