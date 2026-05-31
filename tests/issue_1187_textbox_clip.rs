//! Issue #1187: `BookReview.hwp` 글상자 내용이 영역 밖으로 출력되는 회귀 가드.
//!
//! `samples/basic/BookReview.hwp` 1쪽의 큰 점선 글상자에는 뒤쪽 목차 문단의
//! `line_seg.vertical_pos` 가 글상자 내부 높이를 초과하는 데이터가 들어 있다.
//! 렌더러는 문단을 삭제하거나 재배치하지 않고, 글상자 콘텐츠를 글상자 내부 영역으로
//! clip 해야 한다.

use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Copy)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn render_bookreview_page1_svg() -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("samples/basic/BookReview.hwp");
    let bytes = fs::read(&path).expect("read samples/basic/BookReview.hwp");
    let doc = rhwp::wasm_api::HwpDocument::from_bytes(&bytes).expect("parse BookReview.hwp");
    doc.render_page_svg_native(0).expect("render page 1 svg")
}

fn attr_f64(tag: &str, name: &str) -> Option<f64> {
    let needle = format!("{name}=\"");
    let start = tag.find(&needle)? + needle.len();
    let rest = &tag[start..];
    let end = rest.find('"')?;
    rest[..end].parse().ok()
}

fn textbox_clip_rects(svg: &str) -> Vec<Rect> {
    let mut rects = Vec::new();
    let mut rest = svg;
    while let Some(start) = rest.find("<clipPath") {
        rest = &rest[start..];
        let Some(end) = rest.find("</clipPath>") else {
            break;
        };
        let clip = &rest[..end + "</clipPath>".len()];
        if clip.contains("id=\"textbox-clip-") {
            if let Some(rect_start) = clip.find("<rect") {
                let rect_tail = &clip[rect_start..];
                if let Some(rect_end) = rect_tail.find('>') {
                    let tag = &rect_tail[..=rect_end];
                    if let (Some(x), Some(y), Some(width), Some(height)) = (
                        attr_f64(tag, "x"),
                        attr_f64(tag, "y"),
                        attr_f64(tag, "width"),
                        attr_f64(tag, "height"),
                    ) {
                        rects.push(Rect {
                            x,
                            y,
                            width,
                            height,
                        });
                    }
                }
            }
        }
        rest = &rest[end + "</clipPath>".len()..];
    }
    rects
}

fn svg_text_sequence(svg: &str) -> String {
    let mut out = String::new();
    let mut rest = svg;
    while let Some(open) = rest.find("<text") {
        let after_open = &rest[open..];
        if let Some(gt) = after_open.find('>') {
            let after_tag = &after_open[gt + 1..];
            if let Some(close) = after_tag.find("</text>") {
                out.push_str(&after_tag[..close]);
                rest = &after_tag[close + "</text>".len()..];
                continue;
            }
        }
        break;
    }
    out
}

#[test]
fn bookreview_textbox_content_is_clipped_to_inner_area() {
    let svg = render_bookreview_page1_svg();

    let text = svg_text_sequence(&svg);
    assert!(
        text.contains("강우신지음"),
        "우측 하단 저자 정보 글상자는 사라지면 안 됨. text sequence={text:?}"
    );
    assert!(
        text.contains("원앤원북스"),
        "우측 하단 출판 정보 글상자는 사라지면 안 됨. text sequence={text:?}"
    );

    let rects = textbox_clip_rects(&svg);
    assert!(
        !rects.is_empty(),
        "BookReview.hwp 글상자 콘텐츠에는 textbox clipPath 가 필요함"
    );

    let has_main_textbox_clip = rects.iter().any(|r| {
        (45.0..=51.0).contains(&r.x)
            && (514.0..=520.0).contains(&r.y)
            && (680.0..=695.0).contains(&r.width)
            && (480.0..=495.0).contains(&r.height)
    });
    assert!(
        has_main_textbox_clip,
        "큰 점선 글상자 내부 영역 clip 이 필요함. actual textbox clips={rects:?}"
    );
}
