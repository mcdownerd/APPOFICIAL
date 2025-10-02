"use client";

// ... imports existentes ...

const handleAcknowledge = async (ticketId: string) => {
  try {
    await TicketAPI.acknowledge(ticketId, user.id); // <-- Atualizado para passar user.id
    showSuccess(t("ticketAcknowledged"));
    fetchTickets(); // Refresh
  } catch (error) {
    showError(t("failedToAcknowledge"));
  }
};

const handleDelete = async (ticketId: string) => {
  if (!confirm(t("confirmDeleteTicket"))) return;

  try {
    await TicketAPI.softDelete(ticketId, user.id); // <-- Atualizado para passar user.id
    showSuccess(t("ticketDeleted"));
    fetchTickets(); // Refresh
  } catch (error) {
    showError(t("failedToDeleteTicket"));
  }
};

// ... resto inalterado, incluindo ticket.code que agora existe em Ticket