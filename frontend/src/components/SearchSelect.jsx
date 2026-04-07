import { useState, useRef, useEffect } from 'react'

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
export function SearchSelect({ options = [], value = '', onChange, placeholder = 'Buscar...', className = '' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredOptions, setFilteredOptions] = useState(options)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Filtrar opciones según término de búsqueda
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredOptions(options)
    } else {
      const term = searchTerm.toLowerCase()
      setFilteredOptions(
        options.filter((opt) =>
          opt.label.toLowerCase().includes(term) ||
          (opt.id && String(opt.id).includes(term))
        )
      )
    }
  }, [searchTerm, options])

  // Actualizar posición del dropdown cuando se abre
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      })
      // Focus en el input después de abrir
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen])

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedLabel = options.find((opt) => opt.id === value)?.label || placeholder

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

      {isOpen && (
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
            onChange={(e) => setSearchTerm(e.target.value)}
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
      )}
    </div>
  )
}
