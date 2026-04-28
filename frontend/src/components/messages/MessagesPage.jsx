import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { AttachmentIcon, CloseIcon, SmileIcon } from '../Icons.jsx'
import {
  closeMessageAlarm,
  createMessageConversation,
  fetchMessageConversation,
  fetchMessageConversations,
  fetchMessagesOverview,
  markMessageConversationRead,
  sendMessageReply,
} from '../../lib/api.js'
import {
  ModuleEmptyState,
  ModulePageHeader,
  ModuleSurface,
  PanelMessage,
} from '../modules/ModuleWorkspace.jsx'

const FILTERS = [
  { value: 'inbox', label: 'Bandeja' },
  { value: 'unread', label: 'No leidos' },
  { value: 'alarms', label: 'Alarmas' },
]

const EMOJIS = [
  '\u{1F600}',
  '\u{1F44D}',
  '\u{2705}',
  '\u{1F4E6}',
  '\u{26A0}',
  '\u{1F6E0}',
  '\u{1F4CC}',
  '\u{1F440}',
  '\u{1F64C}',
  '\u{1F69A}',
]

function joinText(values) {
  return values.filter(Boolean).join(' ').toLowerCase()
}

function matchesConversation(conversation, query) {
  if (!query) {
    return true
  }

  return joinText([
    conversation.title,
    conversation.last_message_preview,
    conversation.last_sender_name,
    conversation.alarm?.article_name,
  ]).includes(query)
}

function matchesContact(contact, query) {
  if (!query) {
    return true
  }

  return joinText([
    contact.full_name,
    contact.username,
    contact.email,
    contact.role_label,
    contact.sector_default,
  ]).includes(query)
}

function getConversationContact(conversation, currentUserId) {
  return (conversation.participants || []).find((participant) => participant.id !== currentUserId) || null
}

function getConversationContactId(conversation, currentUserId) {
  return getConversationContact(conversation, currentUserId)?.id || null
}

function getInitials(label) {
  return (label || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function formatBytes(size) {
  if (!size) {
    return '0 B'
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function buildMessagePayload(payload, files) {
  if (!files.length) {
    return payload
  }

  const body = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    body.append(key, value ?? '')
  })
  files.forEach((file) => {
    body.append('attachments', file)
  })
  return body
}

function pickConversationForContact(conversations, contactId, currentUserId, filterKey) {
  const items = conversations.filter(
    (conversation) => getConversationContactId(conversation, currentUserId) === contactId,
  )
  if (!items.length) {
    return null
  }

  if (filterKey === 'alarms') {
    return items.find((conversation) => conversation.kind === 'alarm') || null
  }

  if (filterKey === 'unread') {
    return items.find((conversation) => conversation.is_unread) || items[0]
  }

  return items.find((conversation) => conversation.kind === 'direct') || items[0]
}

function PendingFiles({ files, onRemove }) {
  if (!files.length) {
    return null
  }

  return (
    <div className="messages-attachment-list">
      {files.map((file, index) => (
        <span className="messages-attachment-chip" key={`${file.name}-${file.size}-${index}`}>
          <span>{file.name}</span>
          <small>{formatBytes(file.size)}</small>
          <button
            aria-label={`Quitar ${file.name}`}
            onClick={() => onRemove(index)}
            type="button"
          >
            <CloseIcon />
          </button>
        </span>
      ))}
    </div>
  )
}

function MessageAttachments({ attachments }) {
  if (!attachments?.length) {
    return null
  }

  return (
    <div className="message-attachment-stack">
      {attachments.map((attachment) => (
        <a
          className="message-attachment-link"
          href={attachment.url}
          key={attachment.id}
          rel="noreferrer"
          target="_blank"
        >
          <span>{attachment.name}</span>
          <small>{formatBytes(attachment.size_bytes)}</small>
        </a>
      ))}
    </div>
  )
}

export function MessagesPage() {
  const { refreshSession, searchValue, user } = useOutletContext()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [overview, setOverview] = useState(null)
  const [conversations, setConversations] = useState([])
  const [inboxConversations, setInboxConversations] = useState([])
  const [activeFilter, setActiveFilter] = useState('inbox')
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [conversationDetail, setConversationDetail] = useState(null)
  const [selectedContactId, setSelectedContactId] = useState(null)
  const [replyBody, setReplyBody] = useState('')
  const [replyFiles, setReplyFiles] = useState([])
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [feedback, setFeedback] = useState({ error: '', success: '' })
  const [sending, setSending] = useState(false)
  const [closingAlarm, setClosingAlarm] = useState(false)
  const replyFileRef = useRef(null)
  const feedRef = useRef(null)
  const activeConversationIdRef = useRef(null)
  const selectedContactIdRef = useRef(null)
  const initialLoadRef = useRef(true)

  const normalizedQuery = searchValue.trim().toLowerCase()

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    selectedContactIdRef.current = selectedContactId
  }, [selectedContactId])

  const filteredContacts = useMemo(
    () => (overview?.contacts || []).filter((contact) => matchesContact(contact, normalizedQuery)),
    [overview?.contacts, normalizedQuery],
  )

  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => matchesConversation(conversation, normalizedQuery)),
    [conversations, normalizedQuery],
  )

  const scopedConversations = useMemo(() => {
    if (!selectedContactId) {
      return visibleConversations
    }

    return visibleConversations.filter(
      (conversation) => getConversationContactId(conversation, user.id) === selectedContactId,
    )
  }, [selectedContactId, user.id, visibleConversations])

  const activeConversation = conversationDetail?.conversation || null
  const selectedContact = (overview?.contacts || []).find((contact) => contact.id === selectedContactId) || null

  const scrollConversationToBottom = useCallback((behavior = 'auto') => {
    const feed = feedRef.current
    if (!feed) {
      return
    }

    window.requestAnimationFrame(() => {
      feed.scrollTo({
        top: feed.scrollHeight,
        behavior,
      })
    })
  }, [])

  const syncSessionBadges = useCallback(() => {
    if (!refreshSession) {
      return
    }

    refreshSession().catch(() => null)
  }, [refreshSession])

  const loadMessages = useCallback(async ({
    autoSelectFirst = true,
    conversationId = activeConversationIdRef.current,
    keepConversation = Boolean(activeConversationIdRef.current),
    preserveSelection = Boolean(selectedContactIdRef.current),
    showLoading = false,
  } = {}) => {
    if (showLoading) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const requests = [fetchMessagesOverview(), fetchMessageConversations(activeFilter)]
      if (activeFilter !== 'inbox') {
        requests.push(fetchMessageConversations('inbox'))
      }

      const [overviewResponse, filteredResponse, inboxResponse] = await Promise.all(requests)
      const nextConversations = filteredResponse.items || []
      const nextInboxConversations = activeFilter === 'inbox'
        ? nextConversations
        : (inboxResponse?.items || [])
      const preferredId = keepConversation ? conversationId : null
      const nextConversationId = preferredId || (autoSelectFirst ? nextConversations[0]?.id || null : null)

      setOverview(overviewResponse)
      setConversations(nextConversations)
      setInboxConversations(nextInboxConversations)

      if (!nextConversationId) {
        setActiveConversationId(null)
        setConversationDetail(null)
        if (!preserveSelection) {
          setSelectedContactId(null)
        }
        return
      }

      const detailResponse = await fetchMessageConversation(nextConversationId)
      const nextConversation = detailResponse.item.conversation
      setActiveConversationId(nextConversation.id)
      setConversationDetail(detailResponse.item)
      setSelectedContactId(getConversationContactId(nextConversation, user.id))
    } catch (error) {
      setFeedback({
        error: error.message || 'No se pudo cargar la mensajeria interna.',
        success: '',
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeFilter, user.id])

  const openConversation = useCallback(async (conversationId, { smooth = false } = {}) => {
    setFeedback({ error: '', success: '' })

    try {
      const detailResponse = await fetchMessageConversation(conversationId)
      setActiveConversationId(conversationId)
      setConversationDetail(detailResponse.item)
      setSelectedContactId(getConversationContactId(detailResponse.item.conversation, user.id))
      setReplyBody('')
      setReplyFiles([])
      setEmojiOpen(false)

      if (detailResponse.item.conversation.is_unread) {
        await markMessageConversationRead(conversationId)
        await loadMessages({
          autoSelectFirst: false,
          conversationId,
          keepConversation: true,
          preserveSelection: true,
        })
        syncSessionBadges()
      } else {
        scrollConversationToBottom(smooth ? 'smooth' : 'auto')
      }
    } catch (error) {
      setFeedback({
        error: error.message || 'No se pudo abrir la conversacion.',
        success: '',
      })
    }
  }, [loadMessages, scrollConversationToBottom, syncSessionBadges, user.id])

  useEffect(() => {
    void loadMessages({
      autoSelectFirst: !activeConversationIdRef.current && !selectedContactIdRef.current,
      showLoading: initialLoadRef.current,
    })
    initialLoadRef.current = false
  }, [activeFilter, loadMessages])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadMessages({
        autoSelectFirst: Boolean(activeConversationIdRef.current),
        preserveSelection: Boolean(selectedContactIdRef.current),
      })
    }, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadMessages])

  useEffect(() => {
    if (conversationDetail?.messages?.length) {
      scrollConversationToBottom()
    }
  }, [conversationDetail?.messages?.length, scrollConversationToBottom])

  function appendEmoji(emoji) {
    setReplyBody((current) => `${current}${emoji}`)
  }

  function appendFiles(event) {
    const nextFiles = Array.from(event.target.files || [])
    if (!nextFiles.length) {
      return
    }

    setReplyFiles((current) => [...current, ...nextFiles])
    event.target.value = ''
  }

  async function handleSelectContact(contact) {
    setFeedback({ error: '', success: '' })
    setSelectedContactId(contact.id)
    setReplyBody('')
    setReplyFiles([])
    setEmojiOpen(false)

    const filteredConversation = pickConversationForContact(
      conversations,
      contact.id,
      user.id,
      activeFilter,
    )
    const inboxConversation = pickConversationForContact(
      inboxConversations,
      contact.id,
      user.id,
      'inbox',
    )
    const nextConversation = filteredConversation || (activeFilter === 'inbox' ? inboxConversation : null)

    if (nextConversation) {
      await openConversation(nextConversation.id)
      return
    }

    setActiveConversationId(null)
    setConversationDetail(null)
  }

  async function handleReplySubmit(event) {
    event.preventDefault()
    if ((!activeConversationId && !selectedContactId) || (!replyBody.trim() && !replyFiles.length)) {
      return
    }

    setSending(true)
    setFeedback({ error: '', success: '' })

    try {
      let nextConversationId = activeConversationId

      if (activeConversationId) {
        await sendMessageReply(
          activeConversationId,
          buildMessagePayload({ body: replyBody }, replyFiles),
        )
      } else {
        const response = await createMessageConversation(
          buildMessagePayload(
            {
              body: replyBody,
              priority: 'normal',
              recipient_user_id: String(selectedContactId),
              subject: '',
            },
            replyFiles,
          ),
        )
        nextConversationId = response.item.conversation.id
        setActiveConversationId(nextConversationId)
        if (activeFilter !== 'inbox') {
          setActiveFilter('inbox')
        }
      }

      setReplyBody('')
      setReplyFiles([])
      setEmojiOpen(false)

      await loadMessages({
        autoSelectFirst: false,
        conversationId: nextConversationId,
        keepConversation: true,
        preserveSelection: true,
      })
      syncSessionBadges()
      scrollConversationToBottom('smooth')
    } catch (error) {
      setFeedback({
        error: error.message || 'No se pudo enviar el mensaje.',
        success: '',
      })
    } finally {
      setSending(false)
    }
  }

  async function handleCloseAlarm() {
    if (!activeConversation?.alarm?.id) {
      return
    }

    setClosingAlarm(true)
    setFeedback({ error: '', success: '' })

    try {
      await closeMessageAlarm(activeConversation.alarm.id)
      await loadMessages({
        autoSelectFirst: false,
        conversationId: activeConversationId,
        keepConversation: true,
        preserveSelection: true,
      })
      syncSessionBadges()
      setFeedback({ error: '', success: 'Alarma cerrada.' })
    } catch (error) {
      setFeedback({
        error: error.message || 'No se pudo cerrar la alarma.',
        success: '',
      })
    } finally {
      setClosingAlarm(false)
    }
  }

  if (loading && !overview) {
    return (
      <ModuleEmptyState
        title="Mensajes"
      />
    )
  }

  return (
    <div className="module-page-stack messages-page-shell">
      <ModulePageHeader
        actions={refreshing ? <span className="messages-top-pill">Actualizando</span> : null}
        eyebrow="Comunicacion"
        title="Mensajes"
      />
      <PanelMessage error={feedback.error} success={feedback.success} />

      <section className="messages-workspace">
        <aside className="messages-people-sidebar">
          <div className="messages-people-header">
            <div>
              <p className="messages-sidebar-eyebrow">ERP</p>
              <strong>Personas</strong>
            </div>
            <span className="messages-sidebar-counter">{filteredContacts.length}</span>
          </div>

          <div className="messages-people-list">
            {filteredContacts.length ? filteredContacts.map((contact) => {
              const unreadConversation = pickConversationForContact(
                inboxConversations.filter((conversation) => conversation.is_unread),
                contact.id,
                user.id,
                'unread',
              )

              return (
                <button
                  className={`messages-person-row ${selectedContactId === contact.id ? 'is-active' : ''}`}
                  key={contact.id}
                  onClick={() => {
                    void handleSelectContact(contact)
                  }}
                  type="button"
                >
                  <span className="messages-person-avatar">
                    {contact.avatar_url ? (
                      <img alt={contact.full_name} src={contact.avatar_url} />
                    ) : (
                      getInitials(contact.full_name)
                    )}
                  </span>
                  <span className="messages-person-copy">
                    <strong>{contact.full_name}</strong>
                    <small>{contact.role_label || contact.username}</small>
                  </span>
                  {unreadConversation ? <span className="messages-person-dot" /> : null}
                </button>
              )
            }) : (
              <p className="messages-sidebar-empty">No hay personas visibles para este filtro.</p>
            )}
          </div>
        </aside>

        <div className="messages-main-shell">
          <div className="messages-top-submenu">
            <div className="messages-filter-tabs">
              {FILTERS.map((filter) => (
                <button
                  className={`messages-filter-tab ${activeFilter === filter.value ? 'is-active' : ''}`}
                  key={filter.value}
                  onClick={() => setActiveFilter(filter.value)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="messages-top-actions">
              <span className="messages-top-pill">
                {selectedContact ? selectedContact.full_name : `${visibleConversations.length} conversaciones`}
              </span>
            </div>
          </div>

          <div className="messages-stage">
            <aside className="messages-thread-list-panel">
              <div className="messages-thread-list-header">
                <strong>{selectedContact ? 'Hilos del contacto' : 'Conversaciones'}</strong>
                <span>{scopedConversations.length}</span>
              </div>

              <div className="messages-thread-list">
                {scopedConversations.length ? scopedConversations.map((conversation) => (
                  <button
                    className={`messages-thread-entry ${conversation.id === activeConversationId ? 'is-active' : ''} ${conversation.is_unread ? 'is-unread' : ''}`}
                    key={conversation.id}
                    onClick={() => {
                      void openConversation(conversation.id, { smooth: true })
                    }}
                    type="button"
                  >
                    <div className="messages-thread-entry-head">
                      <strong>{conversation.title}</strong>
                      {conversation.is_unread ? <span className="messages-unread-dot" /> : null}
                    </div>
                    <span className="messages-thread-entry-kind">
                      {conversation.kind === 'alarm' ? 'Alarma' : 'Directo'}
                    </span>
                    <p>{conversation.last_message_preview || 'Sin texto visible'}</p>
                  </button>
                )) : (
                  <div className="messages-thread-list-empty">
                    <strong>Sin hilos en esta vista</strong>
                    <p>
                      {selectedContact
                        ? 'Selecciona otra persona o cambia el filtro superior.'
                        : 'Elige una persona del lateral para iniciar la conversacion.'}
                    </p>
                  </div>
                )}
              </div>
            </aside>

            <ModuleSurface
              actions={
                activeConversation ? (
                  <span className="messages-top-pill">
                    {activeConversation.kind === 'alarm' ? 'Alarma' : 'Directo'}
                  </span>
                ) : null
              }
              className="messages-thread-surface"
              title={activeConversation?.title || selectedContact?.full_name || 'Conversacion'}
            >
              {activeConversation?.alarm ? (
                <div className="messages-alarm-banner">
                  <div>
                    <strong>{activeConversation.alarm.title}</strong>
                    <p>
                      {activeConversation.alarm.priority_label} · {activeConversation.alarm.status_label}
                    </p>
                  </div>
                  <div className="messages-top-actions">
                    {activeConversation.alarm.article_id ? (
                      <Link className="ghost-link" to={`/inventario/stock/${activeConversation.alarm.article_id}`}>
                        Ver articulo
                      </Link>
                    ) : null}
                    {activeConversation.alarm.status !== 'closed' ? (
                      <button
                        className="secondary-button"
                        disabled={closingAlarm}
                        onClick={handleCloseAlarm}
                        type="button"
                      >
                        {closingAlarm ? 'Cerrando...' : 'Cerrar alarma'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {activeConversation || selectedContact ? (
                <div className="messages-thread-panel">
                  <div className="messages-feed" ref={feedRef}>
                    {conversationDetail?.messages?.length ? conversationDetail.messages.map((message) => (
                      <article className={`message-bubble ${message.is_mine ? 'is-mine' : ''}`} key={message.id}>
                        <div className="message-bubble-head">
                          <strong>{message.sender_name}</strong>
                          <span>
                            {new Date(message.created_at).toLocaleString('es-AR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                        {message.body ? <p>{message.body}</p> : null}
                        <MessageAttachments attachments={message.attachments} />
                      </article>
                    )) : (
                      <div className="messages-thread-placeholder">
                        <strong>{selectedContact?.full_name || 'Conversacion nueva'}</strong>
                        <p>Escribe debajo para iniciar el chat.</p>
                      </div>
                    )}
                  </div>

                  <form className="messages-reply-form ops-form" onSubmit={handleReplySubmit}>
                    <label>
                      Respuesta
                      <textarea
                        onChange={(event) => setReplyBody(event.target.value)}
                        rows="3"
                        value={replyBody}
                      />
                    </label>
                    <PendingFiles
                      files={replyFiles}
                      onRemove={(index) =>
                        setReplyFiles((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    />
                    {emojiOpen ? (
                      <div className="emoji-picker">
                        {EMOJIS.map((emoji) => (
                          <button key={emoji} onClick={() => appendEmoji(emoji)} type="button">
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="messages-inline-tools">
                      <button
                        className="icon-action-button"
                        onClick={() => replyFileRef.current?.click()}
                        type="button"
                      >
                        <AttachmentIcon />
                      </button>
                      <button
                        className={`icon-action-button ${emojiOpen ? 'is-active' : ''}`}
                        onClick={() => setEmojiOpen((current) => !current)}
                        type="button"
                      >
                        <SmileIcon />
                      </button>
                      <button
                        className="primary-button"
                        disabled={sending || (!replyBody.trim() && !replyFiles.length)}
                        type="submit"
                      >
                        {sending ? 'Enviando...' : activeConversationId ? 'Responder' : 'Enviar mensaje'}
                      </button>
                    </div>
                    <input
                      hidden
                      multiple
                      onChange={appendFiles}
                      ref={replyFileRef}
                      type="file"
                    />
                  </form>
                </div>
              ) : (
                <ModuleEmptyState
                  description="Selecciona una persona del lateral para empezar a conversar."
                  title="Sin conversacion activa"
                />
              )}
            </ModuleSurface>
          </div>
        </div>
      </section>
    </div>
  )
}
