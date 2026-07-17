use crate::document_core::template_compiler::profile::{StyleProfile, TemplateRole};
use crate::model::control::Control;
use crate::model::document::Document;
use crate::model::paragraph::{ColumnBreakType, Paragraph};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BoundaryCandidate {
    pub section_index: usize,
    pub paragraph_index: usize,
    pub score: i32,
    pub heading: String,
    pub before_preview: Vec<String>,
    pub after_preview: Vec<String>,
    pub reasons: Vec<String>,
}

pub fn rank_body_boundaries(
    document: &Document,
    profile: &StyleProfile,
    limit: usize,
) -> Vec<BoundaryCandidate> {
    let total_paragraphs = document
        .sections
        .iter()
        .map(|section| section.paragraphs.len())
        .sum::<usize>();
    let mut document_index = 0;
    let mut candidates = Vec::new();

    for (section_index, section) in document.sections.iter().enumerate() {
        for (paragraph_index, paragraph) in section.paragraphs.iter().enumerate() {
            if !paragraph.text.trim().is_empty() {
                let mut score = 0;
                let mut reasons = Vec::new();

                if matches_heading_role(paragraph, profile) {
                    score += 40;
                    reasons.push("제목 역할과 문단·글자 모양이 일치함".to_string());
                }
                if matches!(paragraph.column_type, ColumnBreakType::Page) {
                    score += 25;
                    reasons.push("쪽 나눔 직후 문단임".to_string());
                }
                if paragraph_index > 0
                    && section.paragraphs[paragraph_index - 1]
                        .text
                        .trim()
                        .is_empty()
                {
                    score += 10;
                    reasons.push("앞쪽 문단이 비어 있음".to_string());
                }
                if score == 0 {
                    document_index += 1;
                    continue;
                }
                if total_paragraphs > 0 && document_index * 100 <= total_paragraphs * 5 {
                    score -= 20;
                    reasons.push("문서 앞 5% 이내에 위치함".to_string());
                }
                if paragraph
                    .controls
                    .iter()
                    .any(|control| matches!(control, Control::Table(_)))
                {
                    score -= 30;
                    reasons.push("표 컨트롤을 포함함".to_string());
                }

                candidates.push(BoundaryCandidate {
                    section_index,
                    paragraph_index,
                    score,
                    heading: paragraph.text.trim().to_string(),
                    before_preview: section.paragraphs
                        [paragraph_index.saturating_sub(2)..paragraph_index]
                        .iter()
                        .map(|paragraph| paragraph.text.clone())
                        .collect(),
                    after_preview: section.paragraphs
                        [paragraph_index + 1..(paragraph_index + 3).min(section.paragraphs.len())]
                        .iter()
                        .map(|paragraph| paragraph.text.clone())
                        .collect(),
                    reasons,
                });
            }
            document_index += 1;
        }
    }

    candidates.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.section_index.cmp(&right.section_index))
            .then_with(|| left.paragraph_index.cmp(&right.paragraph_index))
    });
    candidates.truncate(limit.min(3));
    candidates
}

fn matches_heading_role(paragraph: &Paragraph, profile: &StyleProfile) -> bool {
    let Some(char_shape_id) = paragraph
        .char_shapes
        .first()
        .map(|shape| shape.char_shape_id)
    else {
        return false;
    };

    [
        TemplateRole::SectionHeading,
        TemplateRole::SubsectionHeading,
    ]
    .into_iter()
    .filter_map(|role| profile.roles.get(&role))
    .any(|style| {
        style.para_shape_id == paragraph.para_shape_id && style.char_shape_id == char_shape_id
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document_core::template_compiler::profile::{
        analyze_style_profile, RoleStyle, StyleProfile,
    };
    use crate::model::control::Control;
    use crate::model::document::{DocInfo, Document, Section};
    use crate::model::paragraph::{CharShapeRef, ColumnBreakType, Paragraph};
    use crate::model::style::{CharShape, ParaShape};
    use std::collections::BTreeMap;

    fn paragraph(text: &str, para_shape_id: u16, char_shape_id: u32) -> Paragraph {
        Paragraph {
            text: text.to_string(),
            para_shape_id,
            char_shapes: vec![CharShapeRef {
                start_pos: 0,
                char_shape_id,
            }],
            ..Default::default()
        }
    }

    fn boundary_fixture() -> Document {
        let mut heading = CharShape::default();
        heading.base_size = 1_800;
        heading.bold = true;

        let mut body = CharShape::default();
        body.base_size = 1_000;

        let mut heading_para = ParaShape::default();
        heading_para.spacing_before = 300;

        let mut paragraphs = vec![
            paragraph("표지", 2, 2),
            paragraph("", 2, 2),
            paragraph("목차", 2, 2),
            paragraph("안내", 2, 2),
            paragraph("", 2, 2),
            paragraph("1. 사업 개요", 1, 1),
            paragraph("사업의 일반 본문", 2, 2),
            paragraph("추진 범위", 3, 3),
            paragraph("세부 본문", 2, 2),
        ];
        paragraphs[5].column_type = ColumnBreakType::Page;

        Document {
            doc_info: DocInfo {
                char_shapes: vec![CharShape::default(), heading.clone(), body, heading],
                para_shapes: vec![
                    ParaShape::default(),
                    heading_para.clone(),
                    ParaShape::default(),
                    heading_para,
                ],
                ..Default::default()
            },
            sections: vec![Section {
                paragraphs,
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    fn profile_for_heading(para_shape_id: u16, char_shape_id: u32) -> StyleProfile {
        StyleProfile {
            roles: BTreeMap::from([(
                TemplateRole::SectionHeading,
                RoleStyle {
                    para_shape_id,
                    char_shape_id,
                    marker: None,
                    confidence: 1.0,
                    evidence: vec!["테스트 제목".to_string()],
                },
            )]),
        }
    }

    #[test]
    fn ranks_first_major_heading_after_front_matter_first() {
        let doc = boundary_fixture();
        let profile = analyze_style_profile(&doc);
        let candidates = rank_body_boundaries(&doc, &profile, 3);
        assert_eq!(candidates[0].section_index, 0);
        assert_eq!(candidates[0].paragraph_index, 5);
        assert!(candidates[0]
            .reasons
            .iter()
            .any(|reason| reason.contains("쪽 나눔")));
        assert!(candidates.len() <= 3);
    }

    #[test]
    fn excludes_paragraphs_without_boundary_evidence() {
        let doc = Document {
            sections: vec![Section {
                paragraphs: vec![
                    paragraph("일반 본문 하나", 1, 1),
                    paragraph("일반 본문 둘", 1, 1),
                    paragraph("일반 본문 셋", 1, 1),
                ],
                ..Default::default()
            }],
            ..Default::default()
        };

        let candidates = rank_body_boundaries(
            &doc,
            &StyleProfile {
                roles: BTreeMap::new(),
            },
            3,
        );

        assert!(candidates.is_empty());
    }

    #[test]
    fn applies_each_score_and_builds_bounded_previews() {
        let mut paragraphs = (0..21)
            .map(|index| paragraph(&format!("문단 {index}"), 2, 2))
            .collect::<Vec<_>>();
        paragraphs[0].text.clear();
        paragraphs[1] = paragraph("첫 제목", 1, 1);
        paragraphs[1].column_type = ColumnBreakType::Page;
        paragraphs[1].controls.push(Control::Table(Box::default()));
        let doc = Document {
            sections: vec![Section {
                paragraphs,
                ..Default::default()
            }],
            ..Default::default()
        };

        let candidates = rank_body_boundaries(&doc, &profile_for_heading(1, 1), 3);

        assert_eq!(candidates[0].score, 40 + 25 + 10 - 20 - 30);
        assert!(candidates[0]
            .reasons
            .iter()
            .any(|reason| reason.contains("제목 역할")));
        assert!(candidates[0]
            .reasons
            .iter()
            .any(|reason| reason.contains("쪽 나눔")));
        assert!(candidates[0]
            .reasons
            .iter()
            .any(|reason| reason.contains("비어 있음")));
        assert!(candidates[0]
            .reasons
            .iter()
            .any(|reason| reason.contains("앞 5%")));
        assert!(candidates[0]
            .reasons
            .iter()
            .any(|reason| reason.contains("표 컨트롤")));
        assert!(candidates[0].before_preview.len() <= 2);
        assert!(candidates[0].after_preview.len() <= 2);
        assert!(candidates
            .iter()
            .all(|candidate| !candidate.reasons.is_empty()));
    }

    #[test]
    fn sorts_ties_by_coordinates_and_caps_limit_at_three() {
        let mut doc = Document {
            sections: vec![Section::default(), Section::default()],
            ..Default::default()
        };
        for section in &mut doc.sections {
            section.paragraphs = (0..3)
                .map(|index| {
                    let mut paragraph = paragraph(&format!("후보 {index}"), 2, 2);
                    paragraph.column_type = ColumnBreakType::Page;
                    paragraph
                })
                .collect();
        }

        let candidates = rank_body_boundaries(
            &doc,
            &StyleProfile {
                roles: BTreeMap::new(),
            },
            usize::MAX,
        );

        assert_eq!(candidates.len(), 3);
        assert_eq!(
            candidates
                .iter()
                .map(|candidate| (candidate.section_index, candidate.paragraph_index))
                .collect::<Vec<_>>(),
            vec![(0, 1), (0, 2), (1, 0)]
        );
        assert!(candidates
            .iter()
            .all(|candidate| !candidate.reasons.is_empty()));

        let limited = rank_body_boundaries(
            &doc,
            &StyleProfile {
                roles: BTreeMap::new(),
            },
            2,
        );
        assert_eq!(limited.len(), 2);
    }
}
