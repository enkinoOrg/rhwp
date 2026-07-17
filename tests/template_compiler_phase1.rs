use rhwp::document_core::template_compiler::boundary::rank_body_boundaries;
use rhwp::document_core::template_compiler::patch::{patch_template, DraftBlock};
use rhwp::document_core::template_compiler::profile::analyze_style_profile;

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
#[ignore = "fixture에 KeyPoint 역할이 없고 추천 경계 뒤 표 컨트롤을 Phase 1 안전장치가 거부함"]
fn patches_serializes_and_reloads_real_hwpx() {
    let bytes = std::fs::read("samples/hwpx_sample2.hwpx").unwrap();
    let mut core = rhwp::DocumentCore::from_bytes(&bytes).unwrap();
    let original_aux = core.document().hwpx_aux_entries.clone();
    let profile = analyze_style_profile(core.document());
    let boundary = rank_body_boundaries(core.document(), &profile, 3).remove(0);
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
    assert_eq!(reloaded.document().hwpx_aux_entries, original_aux);
    assert!(reloaded.document().sections.iter().any(|section| {
        section
            .paragraphs
            .iter()
            .any(|paragraph| paragraph.text.contains("기획 개요"))
    }));
}
