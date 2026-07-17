use rhwp::document_core::template_compiler::boundary::rank_body_boundaries;
use rhwp::document_core::template_compiler::patch::{patch_template, DraftBlock};
use rhwp::document_core::template_compiler::profile::{
    analyze_style_profile, StyleProfile, TemplateRole,
};

fn phase1_draft() -> Vec<DraftBlock> {
    vec![
        DraftBlock::SectionHeading("1. 기획 개요".into()),
        DraftBlock::SubsectionHeading("1-1. 기획 배경 및 필요성".into()),
        DraftBlock::Body("공연 현장의 안전 관리 체계를 데이터 기반으로 고도화한다.".into()),
        DraftBlock::KeyPoint("공연 환경의 특수성을 반영한 통합 안전 관리".into()),
        DraftBlock::Detail("암전, 연무와 고밀도 군중 환경을 함께 분석한다.".into()),
    ]
}

#[test]
fn extracts_all_phase1_roles_from_real_hwpx() {
    let bytes = std::fs::read("samples/hwpx/aift.hwpx").unwrap();
    let core = rhwp::DocumentCore::from_bytes(&bytes).unwrap();
    let profile = analyze_style_profile(core.document());

    assert_eq!(profile.roles.len(), 5);
    for role in phase1_roles() {
        assert!(profile.roles.contains_key(&role), "누락 역할: {role:?}");
    }
}

fn phase1_roles() -> [TemplateRole; 5] {
    [
        TemplateRole::SectionHeading,
        TemplateRole::SubsectionHeading,
        TemplateRole::Body,
        TemplateRole::KeyPoint,
        TemplateRole::Detail,
    ]
}

fn complete_test_profile(mut profile: StyleProfile) -> StyleProfile {
    let body = profile.roles[&TemplateRole::Body].clone();
    for role in phase1_roles() {
        profile.roles.entry(role).or_insert_with(|| body.clone());
    }
    profile
}

#[test]
fn patches_serializes_and_reloads_real_hwpx() {
    let bytes = std::fs::read("samples/hwpx/para-unit-01.hwpx").unwrap();
    let mut core = rhwp::DocumentCore::from_bytes(&bytes).unwrap();
    let original_aux = passthrough_aux_entries(core.document());
    let profile = complete_test_profile(analyze_style_profile(core.document()));
    let boundary = rank_body_boundaries(core.document(), &profile, 3).remove(0);
    assert_eq!((boundary.section_index, boundary.paragraph_index), (0, 2));
    let preserved_prefix = core.document().sections[boundary.section_index].paragraphs
        [..boundary.paragraph_index]
        .iter()
        .map(|paragraph| {
            (
                paragraph.text.clone(),
                paragraph.para_shape_id,
                paragraph
                    .char_shapes
                    .iter()
                    .map(|shape| (shape.start_pos, shape.char_shape_id))
                    .collect::<Vec<_>>(),
                paragraph.controls.len(),
            )
        })
        .collect::<Vec<_>>();

    let patched = patch_template(core.document(), &boundary, &profile, &phase1_draft()).unwrap();
    let actual_prefix = patched.sections[boundary.section_index].paragraphs
        [..boundary.paragraph_index]
        .iter()
        .map(|paragraph| {
            (
                paragraph.text.clone(),
                paragraph.para_shape_id,
                paragraph
                    .char_shapes
                    .iter()
                    .map(|shape| (shape.start_pos, shape.char_shape_id))
                    .collect::<Vec<_>>(),
                paragraph.controls.len(),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(actual_prefix, preserved_prefix);
    core.set_document(patched);

    let output = core.export_hwpx_native().unwrap();
    let reloaded = rhwp::DocumentCore::from_bytes(&output).unwrap();
    assert_eq!(passthrough_aux_entries(reloaded.document()), original_aux);
    assert!(reloaded.document().sections.iter().any(|section| {
        section
            .paragraphs
            .iter()
            .any(|paragraph| paragraph.text.contains("기획 개요"))
    }));
}

fn passthrough_aux_entries(document: &rhwp::model::document::Document) -> Vec<(String, Vec<u8>)> {
    document
        .hwpx_aux_entries
        .iter()
        .filter(|(path, _)| path != "Contents/content.hpf")
        .cloned()
        .collect()
}
