import { Container, Title, Text, Button, Stack, Center } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Container size="sm">
      <Center h="60vh">
        <Stack align="center" gap="md">
          <Title order={1} size="6rem" c="dimmed">
            404
          </Title>
          <Title order={2}>Page Not Found</Title>
          <Text c="dimmed">The page you're looking for doesn't exist.</Text>
          <Button leftSection={<IconArrowLeft size={16} />} onClick={() => navigate("/run")}>
            Go to Run Page
          </Button>
        </Stack>
      </Center>
    </Container>
  );
}

export default NotFoundPage;
