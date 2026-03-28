import { useEffect, useMemo, useState } from 'react'
import {
  Copy,
  Edit3,
  GripVertical,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { Button } from './components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './components/ui/card'
import { Input } from './components/ui/input'

type Lead = {
  id: string
  name: string
  seconds: number
}

type Group = {
  id: string
  name: string
  leads: Lead[]
}

type DragPayload = {
  leadId: string
  fromGroupId: string
}

const STORAGE_KEY = 'wos-rally-groups-v1'

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

const createLead = (index: number): Lead => ({
  id: makeId(),
  name: `Lead ${index + 1}`,
  seconds: 30,
})

const createGroup = (index: number): Group => ({
  id: makeId(),
  name: `Group ${index + 1}`,
  leads: [createLead(0)],
})

const fallbackGroup = (): Group[] => [createGroup(0)]

const parseStoredGroups = (): Group[] => {
  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return fallbackGroup()
  }

  try {
    const parsed: unknown = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return fallbackGroup()
    }

    const validGroups = parsed
      .map((group, groupIndex) => {
        if (!group || typeof group !== 'object') {
          return null
        }

        const g = group as Partial<Group>

        const leads = Array.isArray(g.leads)
          ? g.leads
              .map((lead, leadIndex) => {
                if (!lead || typeof lead !== 'object') {
                  return null
                }

                const l = lead as Partial<Lead>
                const secondsNumber = Number(l.seconds)

                return {
                  id: typeof l.id === 'string' ? l.id : makeId(),
                  name: typeof l.name === 'string' && l.name.trim() ? l.name : `Lead ${leadIndex + 1}`,
                  seconds: Number.isFinite(secondsNumber) ? Math.max(0, secondsNumber) : 0,
                }
              })
              .filter((lead): lead is Lead => lead !== null)
          : []

        return {
          id: typeof g.id === 'string' ? g.id : makeId(),
          name: typeof g.name === 'string' && g.name.trim() ? g.name : `Group ${groupIndex + 1}`,
          leads,
        }
      })
      .filter((group): group is Group => group !== null)

    return validGroups.length ? validGroups : fallbackGroup()
  } catch {
    return fallbackGroup()
  }
}

const buildCopyText = (groups: Group[]) => {
  const includeHeaders = groups.length > 1

  const groupLines = groups
    .map((group) => {
      if (!group.leads.length) {
        return includeHeaders ? [`== ${group.name}`] : []
      }

      const minSeconds = Math.min(...group.leads.map((lead) => lead.seconds))
      const lines = group.leads
        .map((lead) => ({
          name: lead.name,
          diff: Math.max(0, lead.seconds - minSeconds),
        }))
        .sort((a, b) => a.diff - b.diff || a.name.localeCompare(b.name))
        .map((lead) => `${lead.name}- ${lead.diff}s`)

      return includeHeaders ? [`== ${group.name}`, ...lines] : lines
    })
    .flat()

  return groupLines.join('\n')
}

function App() {
  const [groups, setGroups] = useState<Group[]>(() => parseStoredGroups())
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null)
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState('')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
  }, [groups])

  useEffect(() => {
    if (!copyFeedback) {
      return undefined
    }

    const timeout = setTimeout(() => {
      setCopyFeedback('')
    }, 1800)

    return () => clearTimeout(timeout)
  }, [copyFeedback])

  const totalLeads = useMemo(
    () => groups.reduce((total, group) => total + group.leads.length, 0),
    [groups],
  )

  const addGroup = () => {
    setGroups((current) => [...current, createGroup(current.length)])
  }

  const renameGroup = (groupId: string, value: string) => {
    setGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, name: value } : group)),
    )
  }

  const removeGroup = (groupId: string) => {
    setGroups((current) => {
      if (current.length <= 1) {
        return current
      }

      return current.filter((group) => group.id !== groupId)
    })
  }

  const addLead = (groupId: string) => {
    setGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) {
          return group
        }

        return {
          ...group,
          leads: [...group.leads, createLead(group.leads.length)],
        }
      }),
    )
  }

  const renameLead = (groupId: string, leadId: string, value: string) => {
    setGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) {
          return group
        }

        return {
          ...group,
          leads: group.leads.map((lead) => (lead.id === leadId ? { ...lead, name: value } : lead)),
        }
      }),
    )
  }

  const updateSeconds = (groupId: string, leadId: string, value: string) => {
    const parsed = Number(value)

    setGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) {
          return group
        }

        return {
          ...group,
          leads: group.leads.map((lead) => {
            if (lead.id !== leadId) {
              return lead
            }

            return {
              ...lead,
              seconds: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
            }
          }),
        }
      }),
    )
  }

  const removeLead = (groupId: string, leadId: string) => {
    setGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) {
          return group
        }

        return {
          ...group,
          leads: group.leads.filter((lead) => lead.id !== leadId),
        }
      }),
    )
  }

  const moveLead = ({ leadId, fromGroupId }: DragPayload, targetGroupId: string) => {
    if (fromGroupId === targetGroupId) {
      return
    }

    setGroups((current) => {
      let movedLead: Lead | null = null

      const stripped = current.map((group) => {
        if (group.id !== fromGroupId) {
          return group
        }

        const nextLeads = group.leads.filter((lead) => {
          if (lead.id === leadId) {
            movedLead = lead
            return false
          }
          return true
        })

        return {
          ...group,
          leads: nextLeads,
        }
      })

      if (!movedLead) {
        return current
      }

      const leadToMove = movedLead

      return stripped.map((group) => {
        if (group.id !== targetGroupId) {
          return group
        }

        return {
          ...group,
          leads: [...group.leads, leadToMove],
        }
      })
    })
  }

  const copyOffsets = async () => {
    const text = buildCopyText(groups)

    if (!text.trim()) {
      setCopyFeedback('Nothing to copy yet.')
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopyFeedback('Copied to clipboard.')
    } catch {
      const helper = document.createElement('textarea')
      helper.value = text
      helper.style.position = 'fixed'
      helper.style.top = '-9999px'
      document.body.appendChild(helper)
      helper.select()
      document.execCommand('copy')
      document.body.removeChild(helper)
      setCopyFeedback('Copied to clipboard.')
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_45%,_#fefce8_100%)] px-3 py-3 sm:px-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pb-6">
        <section className="rounded-2xl border border-white/70 bg-white/85 p-3 shadow-[0_20px_70px_-50px_rgba(15,23,42,0.8)] backdrop-blur sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-teal-700">WOS Toolkit</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                Rally Leader Counter
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {groups.length} groups · {totalLeads} leaders
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyOffsets} className="h-9 gap-2 px-3">
                <Copy className="h-4 w-4" />
                Quick copy
              </Button>
              <Button variant="secondary" onClick={addGroup} className="h-9 gap-2 px-3">
                <Plus className="h-4 w-4" />
                Add group
              </Button>
            </div>
          </div>
          {copyFeedback && <p className="mt-2 text-sm text-teal-700">{copyFeedback}</p>}
        </section>

        <section className="flex flex-col gap-2">
          {groups.map((group) => (
            <Card
              key={group.id}
              className={dropTargetGroupId === group.id ? 'border-teal-500 ring-2 ring-teal-200' : ''}
              onDragOver={(event) => {
                event.preventDefault()
                setDropTargetGroupId(group.id)
              }}
              onDragLeave={() => {
                setDropTargetGroupId((active) => (active === group.id ? null : active))
              }}
              onDrop={(event) => {
                event.preventDefault()
                const payload = event.dataTransfer.getData('text/plain')

                if (!payload) {
                  setDropTargetGroupId(null)
                  return
                }

                try {
                  const parsed = JSON.parse(payload) as DragPayload
                  if (parsed?.leadId && parsed?.fromGroupId) {
                    moveLead(parsed, group.id)
                  }
                } catch {
                  setCopyFeedback('Drag failed, please try again.')
                }

                setDropTargetGroupId(null)
              }}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-1.5">
                <div className="flex-1">
                  {editingGroupId === group.id ? (
                    <Input
                      value={group.name}
                      onChange={(event) => renameGroup(group.id, event.target.value)}
                      onBlur={() => setEditingGroupId(null)}
                      autoFocus
                      aria-label="Group name"
                    />
                  ) : (
                    <CardTitle>{group.name || 'Unnamed group'}</CardTitle>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingGroupId((active) => (active === group.id ? null : group.id))}
                    aria-label={`Edit ${group.name}`}
                  >
                    {editingGroupId === group.id ? (
                      <Save className="h-4 w-4" />
                    ) : (
                      <Edit3 className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeGroup(group.id)}
                    disabled={groups.length === 1}
                    aria-label={`Delete ${group.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-1.5">
                {group.leads.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2 text-sm text-slate-500">
                    Drop a leader here or add a new one below.
                  </p>
                ) : (
                  group.leads.map((lead) => (
                    <div
                      key={lead.id}
                      className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 p-1.5"
                    >
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            'text/plain',
                            JSON.stringify({ leadId: lead.id, fromGroupId: group.id }),
                          )
                          event.dataTransfer.effectAllowed = 'move'
                        }}
                        className="grid h-7 w-7 place-items-center rounded-md border border-slate-300 bg-white text-slate-600"
                        aria-label={`Drag ${lead.name}`}
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </button>

                      <div className="flex min-w-0 items-center gap-1">
                        {editingLeadId === lead.id ? (
                          <Input
                            value={lead.name}
                            onChange={(event) => renameLead(group.id, lead.id, event.target.value)}
                            onBlur={() => setEditingLeadId(null)}
                            autoFocus
                            aria-label="Leader name"
                            className="h-8"
                          />
                        ) : (
                          <p className="truncate text-sm font-medium text-slate-700">
                            {lead.name || 'Unnamed lead'}
                          </p>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            setEditingLeadId((active) => (active === lead.id ? null : lead.id))
                          }
                          aria-label={`Edit ${lead.name}`}
                        >
                          {editingLeadId === lead.id ? (
                            <Save className="h-3.5 w-3.5" />
                          ) : (
                            <Edit3 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>

                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          value={lead.seconds}
                          onChange={(event) => updateSeconds(group.id, lead.id, event.target.value)}
                          aria-label={`Seconds for ${lead.name}`}
                          className="h-8 w-20 px-2 text-right"
                        />
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          sec
                        </span>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeLead(group.id, lead.id)}
                        aria-label={`Delete ${lead.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>

              <CardFooter>
                <Button
                  variant="outline"
                  className="h-9 w-full gap-2"
                  onClick={() => addLead(group.id)}
                >
                  <Plus className="h-4 w-4" />
                  Add rally lead
                </Button>
              </CardFooter>
            </Card>
          ))}
        </section>

        <p className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldAlert className="h-4 w-4" />
          Data is saved in your browser and available offline after first load.
        </p>
      </div>
    </main>
  )
}

export default App
