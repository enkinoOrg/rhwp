use crate::model::document::Document;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TemplateRole {
    SectionHeading,
    SubsectionHeading,
    Body,
    KeyPoint,
    Detail,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RoleStyle {
    pub para_shape_id: u16,
    pub char_shape_id: u32,
    pub marker: Option<String>,
    pub confidence: f32,
    pub evidence: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StyleProfile {
    pub roles: BTreeMap<TemplateRole, RoleStyle>,
}

type StyleKey = (u16, u32);

pub fn analyze_style_profile(document: &Document) -> StyleProfile {
    let mut frequencies = BTreeMap::<StyleKey, usize>::new();
    let mut marker_frequencies = BTreeMap::<(&str, StyleKey), usize>::new();
    let mut heading_evidence = BTreeMap::<StyleKey, (usize, bool)>::new();

    for paragraph in document
        .sections
        .iter()
        .flat_map(|section| section.paragraphs.iter())
    {
        let text = paragraph.text.trim();
        let Some(char_shape_id) = paragraph
            .char_shapes
            .first()
            .map(|shape| shape.char_shape_id)
        else {
            continue;
        };
        if text.is_empty() {
            continue;
        }

        let key = (paragraph.para_shape_id, char_shape_id);
        let marker = ["○", "-"]
            .into_iter()
            .find(|marker| text.starts_with(marker));
        if let Some(marker) = marker {
            *marker_frequencies.entry((marker, key)).or_default() += 1;
        } else {
            *frequencies.entry(key).or_default() += 1;
        }

        let evidence = heading_evidence.entry(key).or_default();
        evidence.0 += 1;
        evidence.1 |= starts_with_number(text);
    }

    let mut roles = BTreeMap::new();
    let body_key = most_frequent(&frequencies);
    if let Some(key) = body_key {
        roles.insert(
            TemplateRole::Body,
            role_style(
                key,
                None,
                1.0,
                vec!["문단·글자 모양 조합의 사용 빈도가 가장 높음".to_string()],
            ),
        );
    }

    for (marker, role) in [("○", TemplateRole::KeyPoint), ("-", TemplateRole::Detail)] {
        let candidates: BTreeMap<StyleKey, usize> = marker_frequencies
            .iter()
            .filter_map(|(&(candidate_marker, key), &count)| {
                (candidate_marker == marker).then_some((key, count))
            })
            .collect();
        if let Some(key) = most_frequent(&candidates) {
            roles.insert(
                role,
                role_style(
                    key,
                    Some(marker.to_string()),
                    1.0,
                    vec![format!("'{marker}' 마커로 시작하는 문단")],
                ),
            );
        }
    }

    if let Some(body_key) = body_key {
        let body_size = char_shape(document, body_key).map_or(0, |shape| shape.base_size);
        let mut headings: Vec<(i32, StyleKey, Vec<String>)> = heading_evidence
            .into_iter()
            .filter(|(key, _)| *key != body_key)
            .filter_map(|(key, (_, numbered))| {
                let char_shape = char_shape(document, key)?;
                let para_shape = document.doc_info.para_shapes.get(key.0 as usize);
                let mut score = 0;
                let mut evidence = Vec::new();
                if numbered {
                    score += 3;
                    evidence.push("번호 패턴으로 시작함".to_string());
                }
                if char_shape.base_size > body_size {
                    score += 2;
                    evidence.push("본문보다 글자 크기가 큼".to_string());
                }
                if char_shape.bold {
                    score += 2;
                    evidence.push("굵은 글자 모양을 사용함".to_string());
                }
                if para_shape
                    .is_some_and(|shape| shape.spacing_before > 0 || shape.spacing_after > 0)
                {
                    score += 1;
                    evidence.push("문단 앞뒤 간격이 있음".to_string());
                }
                (score > 0).then_some((score, key, evidence))
            })
            .collect();
        headings.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));

        for (index, (score, key, evidence)) in headings.into_iter().take(2).enumerate() {
            let role = if index == 0 {
                TemplateRole::SectionHeading
            } else {
                TemplateRole::SubsectionHeading
            };
            roles.insert(role, role_style(key, None, score as f32 / 8.0, evidence));
        }
    }

    StyleProfile { roles }
}

fn most_frequent(frequencies: &BTreeMap<StyleKey, usize>) -> Option<StyleKey> {
    frequencies
        .iter()
        .max_by(|(key_a, count_a), (key_b, count_b)| {
            count_a.cmp(count_b).then_with(|| key_b.cmp(key_a))
        })
        .map(|(&key, _)| key)
}

fn char_shape(
    document: &Document,
    (_, char_shape_id): StyleKey,
) -> Option<&crate::model::style::CharShape> {
    document.doc_info.char_shapes.get(char_shape_id as usize)
}

fn role_style(
    (para_shape_id, char_shape_id): StyleKey,
    marker: Option<String>,
    confidence: f32,
    evidence: Vec<String>,
) -> RoleStyle {
    RoleStyle {
        para_shape_id,
        char_shape_id,
        marker,
        confidence,
        evidence,
    }
}

fn starts_with_number(text: &str) -> bool {
    let prefix = text.split_whitespace().next().unwrap_or_default();
    let trimmed = prefix.trim_end_matches(['.', ')']);
    !trimmed.is_empty() && trimmed.chars().all(|character| character.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::document::{Document, Section};
    use crate::model::paragraph::{CharShapeRef, Paragraph};
    use crate::model::style::{CharShape, ParaShape};

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

    fn fixture_document() -> Document {
        let mut heading = CharShape::default();
        heading.base_size = 1_800;
        heading.bold = true;

        let mut body = CharShape::default();
        body.base_size = 1_000;

        let mut heading_para = ParaShape::default();
        heading_para.spacing_before = 300;
        heading_para.spacing_after = 200;

        Document {
            doc_info: crate::model::document::DocInfo {
                char_shapes: vec![CharShape::default(), heading, body],
                para_shapes: vec![ParaShape::default(), heading_para, ParaShape::default()],
                ..Default::default()
            },
            sections: vec![Section {
                paragraphs: vec![
                    paragraph("1. 사업 개요", 1, 1),
                    paragraph("일반 본문 첫째", 2, 2),
                    paragraph("일반 본문 둘째", 2, 2),
                    paragraph("일반 본문 셋째", 2, 2),
                    paragraph("○ 핵심 사항", 2, 2),
                    paragraph("- 세부 사항", 2, 2),
                ],
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    #[test]
    fn extracts_four_phase1_roles_from_repeated_paragraphs() {
        let doc = fixture_document();
        let profile = analyze_style_profile(&doc);
        assert_eq!(
            profile.roles[&TemplateRole::SectionHeading].para_shape_id,
            1
        );
        assert_eq!(profile.roles[&TemplateRole::Body].para_shape_id, 2);
        assert_eq!(
            profile.roles[&TemplateRole::KeyPoint].marker.as_deref(),
            Some("○")
        );
        assert_eq!(
            profile.roles[&TemplateRole::Detail].marker.as_deref(),
            Some("-")
        );
        assert!(profile.roles.values().all(|role| role.confidence > 0.0));
    }
}
