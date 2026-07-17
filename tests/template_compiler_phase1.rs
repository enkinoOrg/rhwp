use rhwp::document_core::template_compiler::boundary::{rank_body_boundaries, BoundaryCandidate};
use rhwp::document_core::template_compiler::patch::{patch_template, DraftBlock};
use rhwp::document_core::template_compiler::profile::{analyze_style_profile, TemplateRole};
use std::collections::BTreeSet;
use std::io::Read;
use std::process::Command;

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

#[test]
fn reload_preserves_deep_semantics_against_canonical_roundtrip_excluding_raw_normalization() {
    let bytes = std::fs::read("samples/rowbreak-problem-pages.hwpx").unwrap();
    let mut core = rhwp::DocumentCore::from_bytes(&bytes).unwrap();
    let original_aux = zip_passthrough_aux_entries(&bytes);
    let original_aux_paths = original_aux
        .iter()
        .map(|(path, _)| path.as_str())
        .collect::<Vec<_>>();
    assert!(
        original_aux_paths.contains(&"BinData/image1.bmp"),
        "passthrough 분류는 하드코딩된 보조 파일뿐 아니라 재생성 대상이 아닌 모든 ZIP 엔트리를 포함해야 한다"
    );
    let original_hpf = content_hpf_semantics(&bytes);
    let original_doc_info = format!("{:#?}", core.document().doc_info);
    let original_resources = format!("{:#?}", core.document().bin_data_content);
    let boundary = BoundaryCandidate {
        section_index: 1,
        paragraph_index: 36,
        score: 0,
        heading: String::new(),
        before_preview: Vec::new(),
        after_preview: Vec::new(),
        reasons: vec!["user-selected boundary".into()],
    };
    let canonical_output = core.export_hwpx_native().unwrap();
    let canonical = rhwp::DocumentCore::from_bytes(&canonical_output).unwrap();
    let canonical_prefix = preserved_paragraphs(canonical.document(), &boundary);
    let canonical_doc_info = format!("{:#?}", canonical.document().doc_info);
    let canonical_resources = format!("{:#?}", canonical.document().bin_data_content);
    let profile = analyze_style_profile(core.document());
    assert_eq!(profile.roles.len(), 5);
    let preserved_prefix = preserved_paragraphs(core.document(), &boundary);

    let patched = patch_template(core.document(), &boundary, &profile, &phase1_draft()).unwrap();
    assert_eq!(preserved_paragraphs(&patched, &boundary), preserved_prefix);
    assert_eq!(format!("{:#?}", patched.doc_info), original_doc_info);
    assert_eq!(
        format!("{:#?}", patched.bin_data_content),
        original_resources
    );
    core.set_document(patched);

    let output = core.export_hwpx_native().unwrap();
    let reloaded = rhwp::DocumentCore::from_bytes(&output).unwrap();
    assert_eq!(
        reloaded.document().sections.len(),
        canonical.document().sections.len(),
        "patch/export/reload가 구역을 추가해 예상 밖 빈 페이지를 만들면 안 된다"
    );
    assert!(
        reloaded
            .document()
            .sections
            .iter()
            .all(|section| !section.paragraphs.is_empty()),
        "현재 fixture는 마지막 구역을 패치하므로 빈 후속 구역이 없어야 한다"
    );
    assert_eq!(
        preserved_paragraphs(reloaded.document(), &boundary),
        canonical_prefix
    );
    assert_eq!(
        format!("{:#?}", reloaded.document().doc_info),
        canonical_doc_info
    );
    assert_eq!(
        format!("{:#?}", reloaded.document().bin_data_content),
        canonical_resources
    );
    let output_aux = zip_passthrough_aux_entries(&output)
        .into_iter()
        .filter(|(path, _)| original_aux_paths.contains(&path.as_str()))
        .collect::<Vec<_>>();
    assert_eq!(
        output_aux.iter().map(|(path, _)| path).collect::<Vec<_>>(),
        original_aux
            .iter()
            .map(|(path, _)| path)
            .collect::<Vec<_>>()
    );
    for ((output_path, output_bytes), (original_path, original_bytes)) in
        output_aux.iter().zip(&original_aux)
    {
        assert_eq!(output_path, original_path);
        assert_eq!(
            output_bytes, original_bytes,
            "passthrough 바이트 변경: {output_path}"
        );
    }
    assert_eq!(content_hpf_semantics(&output), original_hpf);
    assert!(reloaded.document().sections.iter().any(|section| {
        section
            .paragraphs
            .iter()
            .any(|paragraph| paragraph.text.contains("기획 개요"))
    }));
}

fn preserved_paragraphs(
    document: &rhwp::model::document::Document,
    boundary: &BoundaryCandidate,
) -> Vec<(String, u16, Vec<(u32, u32)>, String)> {
    document
        .sections
        .iter()
        .enumerate()
        .take(boundary.section_index + 1)
        .flat_map(|(section_index, section)| {
            let limit = if section_index == boundary.section_index {
                boundary.paragraph_index
            } else {
                section.paragraphs.len()
            };
            section.paragraphs[..limit].iter().map(|paragraph| {
                (
                    paragraph.text.clone(),
                    paragraph.para_shape_id,
                    paragraph
                        .char_shapes
                        .iter()
                        .map(|shape| (shape.start_pos, shape.char_shape_id))
                        .collect(),
                    format!("{:#?}", paragraph.controls),
                )
            })
        })
        .collect()
}

#[derive(Debug, PartialEq, Eq)]
struct ContentHpfSemantics {
    metadata: String,
    manifest_items: BTreeSet<(String, String, String, String)>,
    spine: Vec<String>,
}

fn content_hpf_semantics(hwpx: &[u8]) -> ContentHpfSemantics {
    use quick_xml::events::Event;

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(hwpx)).unwrap();
    let mut xml = String::new();
    archive
        .by_name("Contents/content.hpf")
        .unwrap()
        .read_to_string(&mut xml)
        .unwrap();
    let metadata_start = xml.find("<opf:metadata").unwrap();
    let metadata_end = xml[metadata_start..].find("</opf:metadata>").unwrap()
        + metadata_start
        + "</opf:metadata>".len();
    let metadata = xml[metadata_start..metadata_end].to_string();
    let mut reader = quick_xml::Reader::from_str(&xml);
    let mut manifest_items = BTreeSet::new();
    let mut spine = Vec::new();
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer).unwrap() {
            Event::Start(element) | Event::Empty(element) => {
                let name = element.name();
                let local = name.as_ref().rsplit(|byte| *byte == b':').next().unwrap();
                let attributes = element
                    .attributes()
                    .flatten()
                    .map(|attribute| {
                        (
                            String::from_utf8_lossy(attribute.key.as_ref()).into_owned(),
                            String::from_utf8_lossy(attribute.value.as_ref()).into_owned(),
                        )
                    })
                    .collect::<std::collections::BTreeMap<_, _>>();
                if local == b"item" {
                    let media_type = attributes.get("media-type").cloned().unwrap_or_default();
                    manifest_items.insert((
                        attributes.get("id").cloned().unwrap_or_default(),
                        attributes.get("href").cloned().unwrap_or_default(),
                        match media_type.as_str() {
                            "image/jpg" => "image/jpeg".to_string(),
                            _ => media_type,
                        },
                        attributes.get("isEmbeded").cloned().unwrap_or_default(),
                    ));
                } else if local == b"itemref" {
                    spine.push(attributes.get("idref").cloned().unwrap_or_default());
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    ContentHpfSemantics {
        metadata,
        manifest_items,
        spine,
    }
}

#[test]
fn template_spike_cli_rejects_hwp_even_with_hwpx_extension() {
    let temp = temp_path("renamed.hwpx");
    std::fs::write(
        &temp,
        std::fs::read("samples/hwp3-sample16-hwp5-2022.hwp").unwrap(),
    )
    .unwrap();

    let output = Command::new(env!("CARGO_BIN_EXE_rhwp"))
        .args(["template-spike", temp.to_str().unwrap()])
        .output()
        .unwrap();

    let _ = std::fs::remove_file(temp);
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("HWPX ZIP 형식"));
}

#[test]
fn template_spike_cli_rejects_hwp_extension() {
    let output = Command::new(env!("CARGO_BIN_EXE_rhwp"))
        .args(["template-spike", "samples/hwp3-sample16-hwp5-2022.hwp"])
        .output()
        .unwrap();

    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains(".hwpx 확장자"));
}

#[test]
fn template_spike_cli_patches_real_profile_and_reloads_output() {
    let output_path = temp_path("template-spike.hwpx");
    let output = Command::new(env!("CARGO_BIN_EXE_rhwp"))
        .args([
            "template-spike",
            "samples/rowbreak-problem-pages.hwpx",
            "--boundary",
            "1:36",
            "-o",
            output_path.to_str().unwrap(),
        ])
        .output()
        .unwrap();

    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output_path.is_file());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("user-selected"));
    let reloaded = rhwp::DocumentCore::from_bytes(&std::fs::read(&output_path).unwrap()).unwrap();
    assert!(reloaded.document().sections.iter().any(|section| section
        .paragraphs
        .iter()
        .any(|paragraph| paragraph.text.contains("기획 개요"))));
    let _ = std::fs::remove_file(output_path);
}

#[test]
fn template_spike_cli_reuses_ranked_candidate_evidence() {
    let output_path = temp_path("ranked-candidate.hwpx");
    let output = Command::new(env!("CARGO_BIN_EXE_rhwp"))
        .args([
            "template-spike",
            "samples/rowbreak-problem-pages.hwpx",
            "--boundary",
            "0:8",
            "-o",
            output_path.to_str().unwrap(),
        ])
        .output()
        .unwrap();

    assert!(!output.status.success());
    let analysis: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(
        analysis["selectedBoundary"],
        analysis["boundaryCandidates"][0]
    );
    assert_eq!(analysis["selectedBoundary"]["score"], 50);
    assert!(analysis["selectedBoundary"]["reasons"]
        .as_array()
        .is_some_and(|reasons| !reasons.is_empty()));
    assert!(!output_path.exists());
}

fn temp_path(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("rhwp-task4-{}-{name}", std::process::id()))
}

fn zip_passthrough_aux_entries(hwpx: &[u8]) -> Vec<(String, Vec<u8>)> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(hwpx)).unwrap();
    let paths = (0..archive.len())
        .filter_map(|index| {
            let path = archive.by_index(index).ok()?.name().to_string();
            (!is_normally_regenerated_entry(&path)).then_some(path)
        })
        .collect::<Vec<_>>();
    let mut entries = paths
        .into_iter()
        .filter_map(|path| {
            let mut bytes = Vec::new();
            archive
                .by_name(&path)
                .ok()?
                .read_to_end(&mut bytes)
                .unwrap();
            Some((path, bytes))
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.0.cmp(&right.0));
    entries
}

fn is_normally_regenerated_entry(path: &str) -> bool {
    path == "mimetype"
        || path == "Contents/content.hpf"
        || path == "Contents/header.xml"
        || path == "META-INF/container.rdf"
        || path == "META-INF/container.xml"
        || path == "META-INF/manifest.xml"
        || numbered_xml_entry(path, "Contents/section")
        || numbered_xml_entry(path, "Contents/masterpage")
}

fn numbered_xml_entry(path: &str, prefix: &str) -> bool {
    path.strip_prefix(prefix)
        .and_then(|suffix| suffix.strip_suffix(".xml"))
        .is_some_and(|index| !index.is_empty() && index.bytes().all(|byte| byte.is_ascii_digit()))
}
