'use client'

import { createEditor, type RhwpEditor } from '@rhwp/editor'
import { useCallback, useEffect, useRef, useState } from 'react'

import { RHWP_STUDIO_URL } from '../../external-integration/rhwp-client'
import {
  getDocumentFile,
  saveDocumentFile,
  type DocumentVersion,
} from '../lib/api/documents'

interface HwpxEditorProps {
  documentId: string
  onError?: (error: Error) => void
  onSaved?: (version: DocumentVersion) => void
}

// RHWP 편집기와 외부 문서 API를 연결하는 Client Component
export function HwpxEditor({
  documentId,
  onError,
  onSaved,
}: HwpxEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<RhwpEditor | null>(null)
  const versionRef = useRef<DocumentVersion | null>(null)
  const dirtyRef = useRef(false)
  const generationRef = useRef(0)
  const onErrorRef = useRef(onError)
  const onSavedRef = useRef(onSaved)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // 최신 오류 callback 유지
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  // 최신 저장 완료 callback 유지
  useEffect(() => {
    onSavedRef.current = onSaved
  }, [onSaved])

  // dirty 상태를 갱신하고 페이지 이탈 경고에 반영
  const markDirty = useCallback(() => {
    dirtyRef.current = true
    setIsDirty(true)
  }, [])

  // 문서 ID 변경 시 editor 생성, 파일 로드, 리소스 정리
  useEffect(() => {
    const generation = generationRef.current + 1
    generationRef.current = generation
    let editor: RhwpEditor | null = null

    // 현재 문서 generation 확인
    function isCurrentGeneration(): boolean {
      return generationRef.current === generation
    }

    // editor 초기화 함수
    async function initializeEditor() {
      if (!containerRef.current) return

      try {
        editor = await createEditor(containerRef.current, {
          studioUrl: RHWP_STUDIO_URL,
          width: '100%',
          height: '100%',
        })

        if (!isCurrentGeneration()) {
          editor.destroy()
          return
        }

        editorRef.current = editor

        const document = await getDocumentFile(documentId)

        if (!isCurrentGeneration()) return

        await editor.loadFile(document.bytes, document.fileName)

        if (!isCurrentGeneration()) return

        versionRef.current = document.version
        dirtyRef.current = false
        setIsDirty(false)
        setIsSaving(false)
      } catch (error) {
        if (isCurrentGeneration()) {
          onErrorRef.current?.(error instanceof Error ? error : new Error(String(error)))
        }
      }
    }

    void initializeEditor()

    return () => {
      if (isCurrentGeneration()) {
        generationRef.current += 1
        editorRef.current = null
        versionRef.current = null
        dirtyRef.current = false
        setIsDirty(false)
        setIsSaving(false)
      }

      editor?.destroy()
    }
  }, [documentId])

  // 저장되지 않은 편집본의 페이지 이탈 경고
  useEffect(() => {
    // beforeunload 경고 처리
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', warnBeforeUnload)

    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [])

  // editor export 결과를 현재 version 기준으로 저장
  const save = useCallback(async () => {
    const editor = editorRef.current
    const version = versionRef.current
    const generation = generationRef.current

    if (!editor || version === null || isSaving) return

    setIsSaving(true)

    try {
      const bytes = await editor.exportHwpx()
      const result = await saveDocumentFile(documentId, { bytes, version })

      if (generationRef.current !== generation || editorRef.current !== editor) return

      versionRef.current = result.version
      dirtyRef.current = false
      setIsDirty(false)
      onSavedRef.current?.(result.version)
    } catch (error) {
      if (generationRef.current === generation && editorRef.current === editor) {
        onErrorRef.current?.(error instanceof Error ? error : new Error(String(error)))
      }
    } finally {
      if (generationRef.current === generation && editorRef.current === editor) {
        setIsSaving(false)
      }
    }
  }, [documentId, isSaving])

  return (
    <section aria-busy={isSaving}>
      <div
        ref={containerRef}
        onInput={markDirty}
        style={{ height: '720px' }}
      />
      <button type="button" disabled={!isDirty || isSaving} onClick={save}>
        {isSaving ? '저장 중...' : '저장'}
      </button>
    </section>
  )
}
