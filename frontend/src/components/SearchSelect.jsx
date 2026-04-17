import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * SearchSelect - Componente de select con capacidad de búsqueda
 *
 * Props:
 * - options: Array de objetos con { id, label }
 * - value: id seleccionado
 * - onChange: callback(id)
 * - placeholder: texto placeholder
 * - className: clase CSS adicional
 */
export function SearchSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Buscar...',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) {
      return options
    }

    const term = searchTerm.toLowerCase()
    return options.filter((option) =>
      option.label.toLowerCase().includes(term) ||
      (option.id && String(option.id).includes(term))
    )
  }, [options, searchTerm])

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      })
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen])

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedLabel = options.find((option) => option.id === value)?.label || placeholder

  return (
    <div ref={containerRef} className={`search-select-container ${className}`}>
      <button
        type="button"
        className="search-select-button"
        onClick={() => {
          setIsOpen(!isOpen)
        }}
      >
        <span>{selectedLabel}</span>
        <span className={`search-select-arrow ${isOpen ? 'open' : ''}`}>▼</span>
      </button>

      {isOpen ? (
        <div
          className="search-select-dropdown"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="search-select-input"
            placeholder={placeholder}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            autoFocus
          />
          <div className="search-select-options">
            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`search-select-option ${value === option.id ? 'selected' : ''}`}
                  onClick={() => {
                    onChange(option.id)
                    setIsOpen(false)
                    setSearchTerm('')
                  }}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="search-select-empty">Sin resultados</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
