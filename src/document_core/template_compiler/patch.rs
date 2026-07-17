use crate::document_core::template_compiler::boundary::BoundaryCandidate;
use crate::document_core::template_compiler::profile::{StyleProfile, TemplateRole};
use crate::model::control::Control;
use crate::model::document::Document;
use crate::model::paragraph::{CharShapeRef, Paragraph};

#[derive(Debug, Clone, PartialEq)]
pub enum DraftBlock {
    SectionHeading(String),
    SubsectionHeading(String),
    Body(String),
    KeyPoint(String),
    Detail(String),
}

#[derive(Debug, snafu::Snafu)]
pub enum TemplateCompileError {
    #[snafu(display(
        "본문 경계가 문서 범위를 벗어났습니다: section={section}, paragraph={paragraph}"
    ))]
    InvalidBoundary { section: usize, paragraph: usize },
    #[snafu(display("템플릿 역할이 없습니다: {role:?}"))]
    MissingRole { role: TemplateRole },
    #[snafu(display(
        "Phase 1에서 삭제할 수 없는 구조입니다: section={section}, paragraph={paragraph}, control={control}, kind={kind}"
    ))]
    UnsupportedStructure {
        section: usize,
        paragraph: usize,
        control: usize,
        kind: String,
    },
}

pub fn patch_template(
    document: &Document,
    boundary: &BoundaryCandidate,
    profile: &StyleProfile,
    blocks: &[DraftBlock],
) -> Result<Document, TemplateCompileError> {
    let Some(section) = document.sections.get(boundary.section_index) else {
        return Err(TemplateCompileError::InvalidBoundary {
            section: boundary.section_index,
            paragraph: boundary.paragraph_index,
        });
    };
    if boundary.paragraph_index >= section.paragraphs.len() {
        return Err(TemplateCompileError::InvalidBoundary {
            section: boundary.section_index,
            paragraph: boundary.paragraph_index,
        });
    }

    validate_replacement_range(document, boundary)?;

    let paragraphs = blocks
        .iter()
        .map(|block| {
            let (role, text) = block.role_and_text();
            let style = profile
                .roles
                .get(&role)
                .ok_or(TemplateCompileError::MissingRole { role })?;
            let utf16_len = text.encode_utf16().count() as u32;
            Ok(Paragraph {
                char_count: utf16_len + 1,
                para_shape_id: style.para_shape_id,
                text: text.to_string(),
                char_offsets: utf16_offsets(text),
                char_shapes: vec![CharShapeRef {
                    start_pos: 0,
                    char_shape_id: style.char_shape_id,
                }],
                has_para_text: true,
                ..Default::default()
            })
        })
        .collect::<Result<Vec<_>, TemplateCompileError>>()?;

    let mut patched = document.clone();
    patched.sections[boundary.section_index]
        .paragraphs
        .truncate(boundary.paragraph_index);
    patched.sections[boundary.section_index]
        .paragraphs
        .extend(paragraphs);
    patched.sections[boundary.section_index].raw_stream = None;
    for section in patched.sections.iter_mut().skip(boundary.section_index + 1) {
        section.paragraphs.clear();
        section.raw_stream = None;
    }
    Ok(patched)
}

fn validate_replacement_range(
    document: &Document,
    boundary: &BoundaryCandidate,
) -> Result<(), TemplateCompileError> {
    for (section_index, section) in document
        .sections
        .iter()
        .enumerate()
        .skip(boundary.section_index)
    {
        let paragraph_start = if section_index == boundary.section_index {
            boundary.paragraph_index
        } else {
            0
        };
        for (paragraph_index, paragraph) in
            section.paragraphs.iter().enumerate().skip(paragraph_start)
        {
            if let Some((control_index, control)) = paragraph.controls.iter().enumerate().next() {
                return Err(TemplateCompileError::UnsupportedStructure {
                    section: section_index,
                    paragraph: paragraph_index,
                    control: control_index,
                    kind: control_kind(control).to_string(),
                });
            }
        }
    }
    Ok(())
}

fn control_kind(control: &Control) -> &'static str {
    match control {
        Control::SectionDef(_) => "구역 정의",
        Control::ColumnDef(_) => "단 정의",
        Control::Table(_) => "표",
        Control::Shape(_) => "도형",
        Control::Picture(_) => "그림",
        Control::Header(_) => "머리말",
        Control::Footer(_) => "꼬리말",
        Control::Footnote(_) => "각주",
        Control::Endnote(_) => "미주",
        Control::AutoNumber(_) => "자동 번호",
        Control::NewNumber(_) => "새 번호",
        Control::PageNumberPos(_) => "쪽 번호 위치",
        Control::Bookmark(_) => "책갈피",
        Control::Hyperlink(_) => "하이퍼링크",
        Control::Ruby(_) => "덧말",
        Control::CharOverlap(_) => "글자 겹침",
        Control::PageHide(_) => "감추기",
        Control::HiddenComment(_) => "숨은 설명",
        Control::Equation(_) => "수식",
        Control::Field(_) => "필드",
        Control::Form(_) => "양식 개체",
        Control::Unknown(_) => "알 수 없는 컨트롤",
    }
}

impl DraftBlock {
    fn role_and_text(&self) -> (TemplateRole, &str) {
        match self {
            Self::SectionHeading(text) => (TemplateRole::SectionHeading, text),
            Self::SubsectionHeading(text) => (TemplateRole::SubsectionHeading, text),
            Self::Body(text) => (TemplateRole::Body, text),
            Self::KeyPoint(text) => (TemplateRole::KeyPoint, text),
            Self::Detail(text) => (TemplateRole::Detail, text),
        }
    }
}

fn utf16_offsets(text: &str) -> Vec<u32> {
    let mut offset = 0;
    text.chars()
        .map(|character| {
            let current = offset;
            offset += character.len_utf16() as u32;
            current
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document_core::template_compiler::boundary::BoundaryCandidate;
    use crate::document_core::template_compiler::profile::{RoleStyle, StyleProfile, TemplateRole};
    use crate::model::control::Control;
    use crate::model::document::{DocInfo, Document, Section};
    use crate::model::image::Picture;
    use crate::model::paragraph::{CharShapeRef, LineSeg, Paragraph};
    use crate::model::style::CharShape;
    use std::collections::BTreeMap;

    fn paragraph(text: &str, para_shape_id: u16, char_shape_id: u32) -> Paragraph {
        Paragraph {
            text: text.to_string(),
            char_count: text.encode_utf16().count() as u32 + 1,
            para_shape_id,
            char_offsets: (0..text.encode_utf16().count() as u32).collect(),
            char_shapes: vec![CharShapeRef {
                start_pos: 0,
                char_shape_id,
            }],
            line_segs: vec![LineSeg::default()],
            has_para_text: true,
            ..Default::default()
        }
    }

    fn patch_fixture() -> Document {
        let mut paragraphs = vec![
            paragraph("표지", 10, 10),
            paragraph("목차", 11, 11),
            paragraph("안내", 12, 12),
            paragraph("교체할 제목", 1, 1),
            paragraph("교체할 본문", 2, 2),
        ];
        paragraphs[1].controls.push(Control::Table(Box::default()));
        Document {
            doc_info: DocInfo {
                char_shapes: vec![CharShape::default(); 13],
                ..Default::default()
            },
            sections: vec![Section {
                paragraphs,
                raw_stream: Some(vec![1, 2, 3]),
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    fn candidate(section_index: usize, paragraph_index: usize) -> BoundaryCandidate {
        BoundaryCandidate {
            section_index,
            paragraph_index,
            score: 100,
            heading: String::new(),
            before_preview: Vec::new(),
            after_preview: Vec::new(),
            reasons: Vec::new(),
        }
    }

    fn profile() -> StyleProfile {
        StyleProfile {
            roles: BTreeMap::from([
                (
                    TemplateRole::SectionHeading,
                    RoleStyle {
                        para_shape_id: 1,
                        char_shape_id: 1,
                        marker: None,
                        confidence: 1.0,
                        evidence: Vec::new(),
                    },
                ),
                (
                    TemplateRole::Body,
                    RoleStyle {
                        para_shape_id: 2,
                        char_shape_id: 2,
                        marker: None,
                        confidence: 1.0,
                        evidence: Vec::new(),
                    },
                ),
            ]),
        }
    }

    fn complete_profile() -> StyleProfile {
        StyleProfile {
            roles: [
                TemplateRole::SectionHeading,
                TemplateRole::SubsectionHeading,
                TemplateRole::Body,
                TemplateRole::KeyPoint,
                TemplateRole::Detail,
            ]
            .into_iter()
            .enumerate()
            .map(|(index, role)| {
                (
                    role,
                    RoleStyle {
                        para_shape_id: index as u16 + 1,
                        char_shape_id: index as u32 + 1,
                        marker: None,
                        confidence: 1.0,
                        evidence: Vec::new(),
                    },
                )
            })
            .collect(),
        }
    }

    fn draft() -> Vec<DraftBlock> {
        vec![
            DraftBlock::SectionHeading("1. 기획 개요".to_string()),
            DraftBlock::Body("기획 본문".to_string()),
        ]
    }

    #[test]
    fn preserves_front_matter_and_replaces_only_selected_tail() {
        let original = patch_fixture();
        let preserved = original.sections[0].paragraphs[..3]
            .iter()
            .map(|p| {
                (
                    p.text.clone(),
                    p.para_shape_id,
                    p.char_shapes
                        .iter()
                        .map(|r| (r.start_pos, r.char_shape_id))
                        .collect::<Vec<_>>(),
                    p.controls.len(),
                )
            })
            .collect::<Vec<_>>();

        let patched = patch_template(&original, &candidate(0, 3), &profile(), &draft()).unwrap();
        let actual = patched.sections[0].paragraphs[..3]
            .iter()
            .map(|p| {
                (
                    p.text.clone(),
                    p.para_shape_id,
                    p.char_shapes
                        .iter()
                        .map(|r| (r.start_pos, r.char_shape_id))
                        .collect::<Vec<_>>(),
                    p.controls.len(),
                )
            })
            .collect::<Vec<_>>();

        assert_eq!(actual, preserved);
        assert_eq!(patched.sections[0].paragraphs[3].text, "1. 기획 개요");
        assert_eq!(
            patched.doc_info.char_shapes.len(),
            original.doc_info.char_shapes.len()
        );
        assert!(patched.sections[0].raw_stream.is_none());
    }

    #[test]
    fn patches_every_supported_role_with_utf16_metadata() {
        let blocks = vec![
            DraftBlock::SectionHeading("대제목".to_string()),
            DraftBlock::SubsectionHeading("소제목".to_string()),
            DraftBlock::Body("본문😀".to_string()),
            DraftBlock::KeyPoint("핵심".to_string()),
            DraftBlock::Detail("세부".to_string()),
        ];

        let patched = patch_template(
            &patch_fixture(),
            &candidate(0, 3),
            &complete_profile(),
            &blocks,
        )
        .unwrap();
        let inserted = &patched.sections[0].paragraphs[3..];

        assert_eq!(inserted.len(), 5);
        for (index, paragraph) in inserted.iter().enumerate() {
            assert_eq!(paragraph.para_shape_id, index as u16 + 1);
            assert_eq!(paragraph.char_shapes[0].char_shape_id, index as u32 + 1);
            assert!(paragraph.line_segs.is_empty());
        }
        assert_eq!(inserted[2].char_count, 5);
        assert_eq!(inserted[2].char_offsets, vec![0, 1, 2]);
    }

    #[test]
    fn rejects_missing_roles_and_invalid_boundaries_and_clears_later_sections() {
        let original = patch_fixture();
        let missing = patch_template(
            &original,
            &candidate(0, 3),
            &profile(),
            &[DraftBlock::Detail("누락 역할".to_string())],
        );
        assert!(matches!(
            missing,
            Err(TemplateCompileError::MissingRole {
                role: TemplateRole::Detail
            })
        ));

        let invalid = patch_template(&original, &candidate(0, 99), &profile(), &draft());
        assert!(matches!(
            invalid,
            Err(TemplateCompileError::InvalidBoundary {
                section: 0,
                paragraph: 99
            })
        ));

        let mut multi_section = original;
        multi_section.sections.push(Section {
            paragraphs: vec![paragraph("후속 구역 본문", 2, 2)],
            raw_stream: Some(vec![4, 5, 6]),
            ..Default::default()
        });
        let patched =
            patch_template(&multi_section, &candidate(0, 3), &profile(), &draft()).unwrap();

        assert!(patched.sections[1].paragraphs.is_empty());
        assert!(patched.sections[1].raw_stream.is_none());
    }

    #[test]
    fn rejects_table_in_selected_tail_without_mutating_original() {
        let mut original = patch_fixture();
        original.sections[0].paragraphs[4]
            .controls
            .push(Control::Table(Box::default()));
        let before = original.sections[0]
            .paragraphs
            .iter()
            .map(|paragraph| (paragraph.text.clone(), paragraph.controls.len()))
            .collect::<Vec<_>>();

        let result = patch_template(&original, &candidate(0, 3), &profile(), &draft());

        assert!(matches!(
            result,
            Err(TemplateCompileError::UnsupportedStructure {
                section: 0,
                paragraph: 4,
                control: 0,
                ref kind,
            }) if kind == "표"
        ));
        assert_eq!(
            original.sections[0]
                .paragraphs
                .iter()
                .map(|paragraph| (paragraph.text.clone(), paragraph.controls.len()))
                .collect::<Vec<_>>(),
            before
        );
    }

    #[test]
    fn rejects_picture_in_later_section_without_mutating_original() {
        let mut original = patch_fixture();
        original.sections.push(Section {
            paragraphs: vec![paragraph("후속 그림", 2, 2)],
            raw_stream: Some(vec![7, 8, 9]),
            ..Default::default()
        });
        original.sections[1].paragraphs[0]
            .controls
            .push(Control::Picture(Box::<Picture>::default()));
        let before = original
            .sections
            .iter()
            .map(|section| {
                (
                    section
                        .paragraphs
                        .iter()
                        .map(|paragraph| (paragraph.text.clone(), paragraph.controls.len()))
                        .collect::<Vec<_>>(),
                    section.raw_stream.clone(),
                )
            })
            .collect::<Vec<_>>();

        let result = patch_template(&original, &candidate(0, 3), &profile(), &draft());

        assert!(matches!(
            result,
            Err(TemplateCompileError::UnsupportedStructure {
                section: 1,
                paragraph: 0,
                control: 0,
                ref kind,
            }) if kind == "그림"
        ));
        assert_eq!(
            original
                .sections
                .iter()
                .map(|section| {
                    (
                        section
                            .paragraphs
                            .iter()
                            .map(|paragraph| (paragraph.text.clone(), paragraph.controls.len()))
                            .collect::<Vec<_>>(),
                        section.raw_stream.clone(),
                    )
                })
                .collect::<Vec<_>>(),
            before
        );
    }
}
