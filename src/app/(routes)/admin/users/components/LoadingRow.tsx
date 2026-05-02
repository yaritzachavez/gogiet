export default function LoadingRow() {
  return (
    <tr>
      <td colSpan={5} className="px-4 py-8">
        <div className="flex justify-center gap-2">
          <div className="h-3 w-3 animate-bounce rounded-full bg-red-400 [animation-delay:-0.3s]"></div>
          <div className="h-3 w-3 animate-bounce rounded-full bg-red-400 [animation-delay:-0.15s]"></div>
          <div className="h-3 w-3 animate-bounce rounded-full bg-red-400"></div>
        </div>
      </td>
    </tr>
  )
}
